import { Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DashboardEmptyState,
  DashboardErrorState,
  DashboardSkeleton,
  DataTable,
  StatusBadge,
} from '@/components/dashboard';
import {
  useListMyOrdersQuery,
  type StudentOrderDto,
} from '@/features/orders/ordersApi';
import { parseApiError } from '@/lib/apiError';
import { formatEgpAmount } from '@/lib/formatters';

export default function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = useListMyOrdersQuery({
    status: statusFilter,
    page,
    limit: 20,
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

  const columns: ColumnsType<StudentOrderDto> = [
    {
      title: 'Order ID',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => (
        <span className="font-mono text-[13px] text-ink">{id.slice(-8).toUpperCase()}</span>
      ),
    },
    {
      title: 'Course',
      dataIndex: 'courseTitle',
      key: 'courseTitle',
      render: (title: string) => (
        <span className="font-semibold text-ink">{title}</span>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amountMinor',
      key: 'amountMinor',
      render: (amountMinor: number) => (
        <span className="font-bold text-ink">{formatEgpAmount(amountMinor)}</span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record) => (
        <div className="flex items-center gap-xs flex-wrap">
          <StatusBadge label={status} />
          {record.latestRefund && (
            <StatusBadge label={`Refund: ${record.latestRefund.status}`} />
          )}
        </div>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (createdAt: string) => (
        <span className="text-[13px] text-ink-muted">
          {new Date(createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_val, record) => (
        <Link
          to={`/app/orders/${record.id}`}
          className="text-[14px] font-semibold text-primary hover:text-primary-light"
        >
          View Order
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-xl">
      <div>
        <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
          Billing &amp; Receipts
        </span>
        <h1 className="text-[24px] font-bold text-ink mt-xxs">Order History</h1>
      </div>

      {orders.length === 0 && statusFilter === 'all' ? (
        <DashboardEmptyState
          title="No orders yet"
          description="Paid course purchases and their payment statuses will appear here."
        />
      ) : (
        <DataTable<StudentOrderDto>
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
    </div>
  );
}
