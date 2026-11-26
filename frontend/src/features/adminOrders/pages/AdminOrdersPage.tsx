import { Descriptions, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import {
  DashboardButton,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardModal,
  DashboardSkeleton,
  DataTable,
  StatusBadge,
} from '@/components/dashboard';
import {
  useGetAdminOrderDetailQuery,
  useListAdminOrdersQuery,
  type AdminOrderDto,
} from '@/features/adminOrders/adminOrdersApi';
import { parseApiError } from '@/lib/apiError';
import { formatEgpAmount } from '@/lib/formatters';

export default function AdminOrdersPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useListAdminOrdersQuery({
    status: statusFilter,
    page,
    limit: 20,
  });

  const { data: detailRes, isLoading: isDetailLoading } =
    useGetAdminOrderDetailQuery(selectedOrderId ?? '', {
      skip: !selectedOrderId,
    });

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

  const orders = data?.data?.orders ?? [];
  const pagination = data?.data?.pagination;
  const detail = detailRes?.data;

  const columns: ColumnsType<AdminOrderDto> = [
    {
      title: 'Order ID',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => (
        <span className="font-mono text-[13px]">{id.slice(-8).toUpperCase()}</span>
      ),
    },
    {
      title: 'Course',
      dataIndex: 'courseTitle',
      key: 'courseTitle',
      render: (title: string) => <span className="font-semibold text-ink">{title}</span>,
    },
    {
      title: 'Gross',
      dataIndex: 'amountMinor',
      key: 'amountMinor',
      render: (val: number) => (
        <span className="font-bold text-ink">{formatEgpAmount(val)}</span>
      ),
    },
    {
      title: 'Platform / Instructor',
      key: 'split',
      render: (_v, r) => (
        <span className="text-[12px] text-ink-secondary">
          {formatEgpAmount(r.platformAmountMinor)} /{' '}
          {formatEgpAmount(r.instructorAmountMinor)} ({r.commissionBps / 100}%)
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => <StatusBadge label={val} />,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_v, r) => (
        <DashboardButton
          variant="link-action"
          onClick={() => setSelectedOrderId(r.id)}
        >
          Inspect
        </DashboardButton>
      ),
    },
  ];

  return (
    <div className="space-y-xl">
      <div>
        <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
          Financial Oversight (Read-Only)
        </span>
        <h1 className="text-[24px] font-bold text-ink mt-xxs">Orders</h1>
      </div>

      {orders.length === 0 && statusFilter === 'all' ? (
        <DashboardEmptyState title="No orders recorded yet" />
      ) : (
        <DataTable<AdminOrderDto>
          rowKey="id"
          columns={columns}
          dataSource={orders}
          toolbarRight={
            <Select
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val);
                setPage(1);
              }}
              style={{ width: 160 }}
              options={[
                { label: 'All Statuses', value: 'all' },
                { label: 'Paid', value: 'paid' },
                { label: 'Pending', value: 'pending' },
                { label: 'Failed', value: 'failed' },
                { label: 'Refunded', value: 'refunded' },
              ]}
            />
          }
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
        open={Boolean(selectedOrderId)}
        onCancel={() => setSelectedOrderId(null)}
        title="Admin Order Snapshot"
        width={680}
      >
        {isDetailLoading || !detail ? (
          <DashboardSkeleton rows={4} />
        ) : (
          <div className="space-y-md pt-sm">
            <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
              <Descriptions.Item label="Order ID">
                <span className="font-mono text-[12px]">{detail.order.id}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <StatusBadge label={detail.order.status} />
              </Descriptions.Item>
              <Descriptions.Item label="Course">
                {detail.order.courseTitle}
              </Descriptions.Item>
              <Descriptions.Item label="Gross Amount">
                {formatEgpAmount(detail.order.amountMinor)}
              </Descriptions.Item>
              <Descriptions.Item label="Platform Commission">
                {formatEgpAmount(detail.order.platformAmountMinor)} (
                {detail.order.commissionBps / 100}%)
              </Descriptions.Item>
              <Descriptions.Item label="Instructor Share">
                {formatEgpAmount(detail.order.instructorAmountMinor)}
              </Descriptions.Item>
              <Descriptions.Item label="Student ID">
                <span className="font-mono text-[12px]">{detail.order.studentId}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Instructor ID">
                <span className="font-mono text-[12px]">{detail.order.instructorId}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Stripe PaymentIntent">
                <span className="font-mono text-[12px]">
                  {detail.payment?.paymentIntentId ?? '—'}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Stripe Session">
                <span className="font-mono text-[12px]">
                  {detail.payment?.checkoutSessionId ?? '—'}
                </span>
              </Descriptions.Item>
            </Descriptions>

            {detail.refunds.length > 0 && (
              <div className="space-y-xs">
                <p className="text-[13px] font-semibold text-ink m-0">
                  Refund History
                </p>
                {detail.refunds.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between text-[13px] rounded-md border border-border p-xs"
                  >
                    <span>
                      {formatEgpAmount(r.amountMinor)} ({r.kind})
                    </span>
                    <StatusBadge label={r.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DashboardModal>
    </div>
  );
}
