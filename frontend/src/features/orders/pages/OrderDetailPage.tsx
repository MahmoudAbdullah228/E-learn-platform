import { ArrowLeftOutlined } from '@ant-design/icons';
import { Card, Descriptions } from 'antd';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  DashboardButton,
  DashboardErrorState,
  DashboardSkeleton,
  StatusBadge,
} from '@/components/dashboard';
import { useGetMyOrderDetailQuery } from '@/features/orders/ordersApi';
import { parseApiError } from '@/lib/apiError';
import { formatEgpAmount } from '@/lib/formatters';

export default function OrderDetailPage() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, isError, error, refetch } = useGetMyOrderDetailQuery(
    orderId,
    { skip: !orderId },
  );

  if (isLoading) {
    return <DashboardSkeleton rows={6} />;
  }

  const payload = data?.data;

  if (isError || !payload) {
    const parsed = parseApiError(error, 'Order was not found.');
    return (
      <DashboardErrorState
        title={parsed.status === 404 ? 'Order Not Found' : 'Unable to Load Order'}
        message={
          parsed.status === 404 ? 'Order was not found.' : parsed.message
        }
        onRetry={
          parsed.status === 404 ? () => navigate('/app/orders') : () => refetch()
        }
        retryLabel={parsed.status === 404 ? 'Back to Order History' : 'Try Again'}
      />
    );
  }

  const { order, payment } = payload;

  return (
    <div className="space-y-lg max-w-[820px]">
      <Link
        to="/app/orders"
        className="inline-flex items-center gap-xs text-[14px] font-semibold text-primary hover:text-primary-light"
      >
        <ArrowLeftOutlined />
        <span>Back to Order History</span>
      </Link>

      <Card className="rounded-xxl shadow-card border-hairline" styles={{ body: { padding: 24 } }}>
        <div className="flex flex-wrap items-start justify-between gap-md mb-lg">
          <div>
            <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
              Order Receipt
            </span>
            <h1 className="text-[24px] font-bold text-ink mt-xxs mb-0">
              {order.courseTitle}
            </h1>
          </div>
          <StatusBadge label={order.status} />
        </div>

        <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
          <Descriptions.Item label="Order ID">
            <span className="font-mono text-[13px]">{order.id}</span>
          </Descriptions.Item>
          <Descriptions.Item label="Amount">
            <span className="font-bold">{formatEgpAmount(order.amountMinor)}</span>
          </Descriptions.Item>
          <Descriptions.Item label="Created">
            {new Date(order.createdAt).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="Paid At">
            {order.paidAt ? new Date(order.paidAt).toLocaleString() : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Payment Provider">
            {payment?.provider ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Payment Status">
            {payment ? <StatusBadge label={payment.status} /> : '—'}
          </Descriptions.Item>
        </Descriptions>

        {order.latestRefund ? (
          <div className="mt-lg rounded-lg bg-surface-subtle border border-border p-md space-y-xs">
            <div className="flex items-center justify-between gap-sm">
              <span className="text-[14px] font-semibold text-ink">Refund Status</span>
              <StatusBadge label={order.latestRefund.status} />
            </div>
            <p className="text-[13px] text-ink-secondary m-0">
              Amount: {formatEgpAmount(order.latestRefund.amountMinor)} • Requested{' '}
              {new Date(order.latestRefund.createdAt).toLocaleString()}
            </p>
          </div>
        ) : order.status === 'paid' ? (
          <p className="mt-lg text-[13px] text-ink-muted m-0">
            Refunds are processed by platform administrators upon request.
          </p>
        ) : null}

        {order.status === 'paid' && (
          <div className="mt-lg flex justify-end">
            <Link to={`/app/my-courses/${order.courseId}`}>
              <DashboardButton variant="primary">Open Course</DashboardButton>
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
