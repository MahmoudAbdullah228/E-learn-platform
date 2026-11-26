import { Alert, Input, Select, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import {
  DashboardButton,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardModal,
  DashboardSearchField,
  DashboardSkeleton,
  DataTable,
  StatusBadge,
  useDashboardNotify,
} from '@/components/dashboard';
import {
  useChangeAdminUserStatusMutation,
  useListAdminUsersQuery,
  type AdminUserDto,
} from '@/features/adminUsers/adminUsersApi';
import { parseApiError } from '@/lib/apiError';
import type { AccountStatus, UserRole } from '@/types/api';

export default function AdminUsersPage() {
  const { message } = useDashboardNotify();
  const [searchDraft, setSearchDraft] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AccountStatus | 'all'>('all');
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const [selectedUser, setSelectedUser] = useState<AdminUserDto | null>(null);
  const [reason, setReason] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useListAdminUsersQuery({
    q: appliedQ || undefined,
    role: roleFilter === 'all' ? undefined : roleFilter,
    status: statusFilter === 'all' ? undefined : statusFilter,
    cursor,
    limit: 20,
  });

  const [changeUserStatus, { isLoading: isSavingStatus }] =
    useChangeAdminUserStatusMutation();

  if (isLoading) {
    return <DashboardSkeleton rows={6} />;
  }

  if (isError) {
    return (
      <DashboardErrorState
        message={parseApiError(error).message}
        onRetry={() => refetch()}
      />
    );
  }

  const users = data?.data?.users ?? [];
  const pagination = data?.data?.pagination;

  const handleApplySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCursor(undefined);
    setAppliedQ(searchDraft.trim());
  };

  const handleToggleUserStatus = async () => {
    if (!selectedUser) return;
    setModalError(null);

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 10 || trimmedReason.length > 500) {
      setModalError('Audit reason must be 10 to 500 characters.');
      return;
    }

    const nextStatus: AccountStatus =
      selectedUser.status === 'active' ? 'suspended' : 'active';

    try {
      await changeUserStatus({
        userId: selectedUser.id,
        status: nextStatus,
        reason: trimmedReason,
        expectedRevision: selectedUser.revision,
      }).unwrap();

      setSelectedUser(null);
      setReason('');
      void message.success(
        nextStatus === 'suspended'
          ? 'User suspended and active sessions revoked.'
          : 'User account reactivated.',
      );
    } catch (err) {
      const parsed = parseApiError(err);
      // Surface LAST_ACTIVE_ADMIN / SELF_SUSPENSION_NOT_ALLOWED / STATE_CONFLICT explicitly.
      setModalError(parsed.message);
      if (parsed.code === 'STATE_CONFLICT') {
        void refetch();
      }
    }
  };

  const columns: ColumnsType<AdminUserDto> = [
    {
      title: 'User',
      key: 'user',
      render: (_v, r) => (
        <div>
          <p className="font-semibold text-ink m-0">{r.name}</p>
          <p className="text-[12px] text-ink-muted m-0">{r.email}</p>
        </div>
      ),
    },
    {
      title: 'Roles',
      dataIndex: 'roles',
      key: 'roles',
      render: (roles: UserRole[]) => (
        <Space size="small" wrap>
          {roles.map((role) => (
            <StatusBadge key={role} label={role} tone="teal" />
          ))}
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: AccountStatus) => <StatusBadge label={status} />,
    },
    {
      title: 'Instructor Status',
      dataIndex: 'instructorStatus',
      key: 'instructorStatus',
      render: (val: string) => <StatusBadge label={val} />,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_v, r) => (
        <DashboardButton
          variant="link-action"
          onClick={() => {
            setSelectedUser(r);
            setReason('');
            setModalError(null);
          }}
        >
          {r.status === 'active' ? 'Suspend / Revoke Sessions' : 'Reactivate'}
        </DashboardButton>
      ),
    },
  ];

  return (
    <div className="space-y-xl">
      <div>
        <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
          Security &amp; Accounts
        </span>
        <h1 className="text-[24px] font-bold text-ink mt-xxs">User Management</h1>
      </div>

      <DataTable<AdminUserDto>
        rowKey="id"
        columns={columns}
        dataSource={users}
        locale={{
          emptyText: (
            <DashboardEmptyState
              title="No matching users"
              description="Try adjusting your search query or filters."
            />
          ),
        }}
        toolbarLeft={
          <form onSubmit={handleApplySearch} className="flex gap-xs max-w-[360px]">
            <DashboardSearchField
              placeholder="Search name or email prefix..."
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
            />
            <DashboardButton htmlType="submit" variant="primary">
              Search
            </DashboardButton>
          </form>
        }
        toolbarRight={
          <Space wrap>
            <Select
              value={roleFilter}
              onChange={(val) => {
                setRoleFilter(val);
                setCursor(undefined);
              }}
              style={{ width: 140 }}
              options={[
                { label: 'All Roles', value: 'all' },
                { label: 'Student', value: 'student' },
                { label: 'Instructor', value: 'instructor' },
                { label: 'Admin', value: 'admin' },
              ]}
            />
            <Select
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val);
                setCursor(undefined);
              }}
              style={{ width: 140 }}
              options={[
                { label: 'All Statuses', value: 'all' },
                { label: 'Active', value: 'active' },
                { label: 'Suspended', value: 'suspended' },
              ]}
            />
          </Space>
        }
        pagination={false}
      />

      <div className="flex justify-end gap-xs">
        {cursor && (
          <DashboardButton
            variant="secondary"
            onClick={() => setCursor(undefined)}
          >
            Back to First Page
          </DashboardButton>
        )}
        {pagination?.hasMore && pagination.nextCursor && (
          <DashboardButton
            variant="primary"
            onClick={() => setCursor(pagination.nextCursor ?? undefined)}
          >
            Next Page
          </DashboardButton>
        )}
      </div>

      <DashboardModal
        open={Boolean(selectedUser)}
        onCancel={() => setSelectedUser(null)}
        title={
          selectedUser?.status === 'active'
            ? 'Suspend User & Revoke Sessions'
            : 'Reactivate User Account'
        }
      >
        {selectedUser && (
          <div className="space-y-md pt-sm">
            {modalError && <Alert type="error" showIcon title={modalError} />}

            <p className="text-[14px] text-ink-secondary m-0">
              {selectedUser.status === 'active'
                ? `Suspending ${selectedUser.name} (${selectedUser.email}) immediately blocks login and revokes all active refresh sessions.`
                : `Reactivating ${selectedUser.name} (${selectedUser.email}) restores account access.`}
            </p>

            <div className="space-y-xxs">
              <label className="block text-[13px] font-semibold text-ink">
                Audit Reason (10–500 characters)
              </label>
              <Input.TextArea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Provide a clear reason for this administrative action..."
              />
            </div>

            <div className="flex justify-end gap-xs">
              <DashboardButton
                variant="secondary"
                onClick={() => setSelectedUser(null)}
              >
                Cancel
              </DashboardButton>
              <DashboardButton
                variant="primary"
                loading={isSavingStatus}
                onClick={handleToggleUserStatus}
              >
                {selectedUser.status === 'active'
                  ? 'Confirm Suspend & Revoke'
                  : 'Confirm Reactivate'}
              </DashboardButton>
            </div>
          </div>
        )}
      </DashboardModal>
    </div>
  );
}
