import { Alert, Input, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import {
  DashboardButton,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardModal,
  DashboardSkeleton,
  DataTable,
  SegmentedFilter,
  StatusBadge,
  useDashboardNotify,
} from '@/components/dashboard';
import {
  useListAdminInstructorApplicationsQuery,
  useReviewInstructorApplicationMutation,
  type AdminInstructorApplicationDto,
} from '@/features/adminApplications/adminApplicationsApi';
import { parseApiError } from '@/lib/apiError';
import { rejectionReasonSchema } from '@/lib/validation';

type ApplicationStatusFilter = 'pending' | 'approved' | 'rejected';

export default function AdminApplicationsPage() {
  const { message } = useDashboardNotify();
  const [status, setStatus] = useState<ApplicationStatusFilter>('pending');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminInstructorApplicationDto | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } =
    useListAdminInstructorApplicationsQuery({ status, page, limit: 20 });

  const [reviewApplication, { isLoading: isReviewing }] =
    useReviewInstructorApplicationMutation();

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

  const applications = data?.data?.applications ?? [];
  const pagination = data?.data?.pagination;

  const handleApprove = async (applicationId: string) => {
    setModalError(null);
    try {
      await reviewApplication({
        applicationId,
        body: { status: 'approved' },
      }).unwrap();
      void message.success('Instructor application approved.');
      setSelected(null);
    } catch (err) {
      const parsed = parseApiError(err);
      setModalError(parsed.message);
      if (
        parsed.code === 'APPLICATION_ALREADY_REVIEWED' ||
        parsed.code === 'APPLICANT_STATE_CONFLICT'
      ) {
        void refetch();
      }
    }
  };

  const handleReject = async (applicationId: string) => {
    setModalError(null);
    const parsedReason = rejectionReasonSchema.safeParse(rejectReason);
    if (!parsedReason.success) {
      setModalError(parsedReason.error.issues[0]?.message ?? 'Invalid reason');
      return;
    }

    try {
      await reviewApplication({
        applicationId,
        body: { status: 'rejected', rejectionReason: parsedReason.data },
      }).unwrap();
      void message.success('Instructor application rejected.');
      setSelected(null);
      setRejectReason('');
    } catch (err) {
      const parsed = parseApiError(err);
      setModalError(parsed.message);
      if (
        parsed.code === 'APPLICATION_ALREADY_REVIEWED' ||
        parsed.code === 'APPLICANT_STATE_CONFLICT'
      ) {
        void refetch();
      }
    }
  };

  const columns: ColumnsType<AdminInstructorApplicationDto> = [
    {
      title: 'Applicant',
      key: 'applicant',
      render: (_v, record) =>
        record.applicant ? (
          <div>
            <p className="font-semibold text-ink m-0">{record.applicant.name}</p>
            <p className="text-[12px] text-ink-muted m-0">{record.applicant.email}</p>
          </div>
        ) : (
          <span className="text-ink-muted italic">
            Unavailable account ({record.userId.slice(-6)})
          </span>
        ),
    },
    {
      title: 'Expertise',
      dataIndex: 'expertise',
      key: 'expertise',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => <StatusBadge label={val} />,
    },
    {
      title: 'Submitted',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (val: string) => new Date(val).toLocaleDateString(),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_v, record) => (
        <DashboardButton
          variant="link-action"
          onClick={() => {
            setSelected(record);
            setRejectReason('');
            setModalError(null);
          }}
        >
          {record.status === 'pending' ? 'Review' : 'View'}
        </DashboardButton>
      ),
    },
  ];

  return (
    <div className="space-y-xl">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
            Moderation
          </span>
          <h1 className="text-[24px] font-bold text-ink mt-xxs">
            Instructor Applications
          </h1>
        </div>

        <SegmentedFilter<ApplicationStatusFilter>
          value={status}
          onChange={(val) => {
            setStatus(val);
            setPage(1);
          }}
          options={[
            { label: 'Pending', value: 'pending' },
            { label: 'Approved', value: 'approved' },
            { label: 'Rejected', value: 'rejected' },
          ]}
        />
      </div>

      {applications.length === 0 ? (
        <DashboardEmptyState
          title={`No ${status} applications`}
          description="Applications matching this status will appear here."
        />
      ) : (
        <DataTable<AdminInstructorApplicationDto>
          rowKey="id"
          columns={columns}
          dataSource={applications}
          pagination={
            pagination
              ? {
                  current: pagination.page,
                  pageSize: pagination.limit,
                  total: pagination.total,
                  onChange: (nextPage) => setPage(nextPage),
                }
              : false
          }
        />
      )}

      <DashboardModal
        open={Boolean(selected)}
        onCancel={() => setSelected(null)}
        title="Instructor Application Detail"
        width={640}
      >
        {selected && (
          <div className="space-y-md pt-sm">
            {modalError && <Alert type="error" showIcon title={modalError} />}

            <div className="flex items-center justify-between gap-md">
              <div>
                <p className="text-[16px] font-semibold text-ink m-0">
                  {selected.applicant?.name ?? 'Unavailable Account'}
                </p>
                <p className="text-[13px] text-ink-muted m-0">
                  {selected.applicant?.email ?? selected.userId}
                </p>
              </div>
              <StatusBadge label={selected.status} />
            </div>

            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-muted mb-xxs">
                Expertise
              </p>
              <p className="text-[14px] text-ink m-0">{selected.expertise}</p>
            </div>

            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-muted mb-xxs">
                Bio
              </p>
              <p className="text-[14px] text-ink-secondary whitespace-pre-line m-0">
                {selected.bio}
              </p>
            </div>

            {selected.links.length > 0 && (
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-muted mb-xxs">
                  Links
                </p>
                <ul className="space-y-xxs pl-0 list-none m-0">
                  {selected.links.map((link) => (
                    <li key={link.url}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[13px] text-primary hover:underline"
                      >
                        {link.label}: {link.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selected.status === 'rejected' && selected.rejectionReason && (
              <Alert
                type="error"
                showIcon
                title="Rejection Reason"
                description={selected.rejectionReason}
              />
            )}

            {selected.status === 'pending' && (
              <div className="space-y-sm pt-sm border-t border-hairline">
                <label className="block text-[13px] font-semibold text-ink">
                  Rejection Reason (5–500 chars, required only if rejecting)
                </label>
                <Input.TextArea
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explain what needs improvement before reapplying..."
                />
                <Space wrap>
                  <DashboardButton
                    variant="primary"
                    loading={isReviewing}
                    onClick={() => handleApprove(selected.id)}
                  >
                    Approve Instructor
                  </DashboardButton>
                  <DashboardButton
                    variant="outline"
                    loading={isReviewing}
                    onClick={() => handleReject(selected.id)}
                  >
                    Reject Application
                  </DashboardButton>
                </Space>
              </div>
            )}
          </div>
        )}
      </DashboardModal>
    </div>
  );
}
