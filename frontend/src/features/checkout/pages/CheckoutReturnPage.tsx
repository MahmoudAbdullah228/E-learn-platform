import { CheckCircleOutlined, ClockCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { Card, Space } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { baseApi } from '@/app/baseApi';
import { useAppDispatch } from '@/app/hooks';
import {
  DashboardButton,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardSkeleton,
  StatusBadge,
} from '@/components/dashboard';
import { PENDING_ORDER_STORAGE_KEY } from '@/features/courseDetails/pages/CourseDetailsPage';
import { useGetMyOrderDetailQuery } from '@/features/orders/ordersApi';
import { parseApiError } from '@/lib/apiError';
import { formatEgpAmount } from '@/lib/formatters';

interface CheckoutReturnPageProps {
  mode: 'success' | 'cancel';
}

const FAST_POLL_MS = 5_000;
const SLOW_POLL_MS = 30_000;
const BACKOFF_AFTER_MS = 30_000;
const MAX_POLL_DURATION_MS = 120_000;

export default function CheckoutReturnPage({ mode }: CheckoutReturnPageProps) {
  const dispatch = useAppDispatch();
  const [searchParams] = useSearchParams();
  const [orderId] = useState<string | null>(() => {
    const fromQuery = searchParams.get('orderId');
    if (fromQuery) return fromQuery;
    try {
      return sessionStorage.getItem(PENDING_ORDER_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const startedAtRef = useRef<number | null>(null);
  const [pollingStopped, setPollingStopped] = useState(false);

  const { data, isLoading, isFetching, isError, error, refetch } =
    useGetMyOrderDetailQuery(orderId ?? '', {
      skip: !orderId,
      refetchOnMountOrArgChange: true,
    });

  const order = data?.data?.order;
  const isFinal =
    order?.status === 'paid' ||
    order?.status === 'failed' ||
    order?.status === 'expired' ||
    order?.status === 'refunded';

  useEffect(() => {
    if (order?.status === 'paid') {
      dispatch(baseApi.util.invalidateTags(['Enrollment']));
      try {
        sessionStorage.removeItem(PENDING_ORDER_STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
  }, [dispatch, order?.status]);

  useEffect(() => {
    if (!orderId || isFinal || pollingStopped) return;

    if (startedAtRef.current === null) {
      startedAtRef.current = Date.now();
    }

    let timerId: number | undefined;

    const scheduleNext = () => {
      const elapsed = Date.now() - (startedAtRef.current ?? Date.now());
      if (elapsed >= MAX_POLL_DURATION_MS) {
        setPollingStopped(true);
        return;
      }

      const delay = elapsed < BACKOFF_AFTER_MS ? FAST_POLL_MS : SLOW_POLL_MS;
      timerId = window.setTimeout(() => {
        void refetch();
        scheduleNext();
      }, delay);
    };

    scheduleNext();
    return () => {
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, [isFinal, orderId, pollingStopped, refetch]);

  if (!orderId) {
    return (
      <DashboardEmptyState
        title={
          mode === 'cancel'
            ? 'Checkout was cancelled'
            : 'No pending order found'
        }
        description="Check your Order History to inspect any recent purchases."
        actionLabel="View Order History"
        onAction={() => {
          window.location.assign('/app/orders');
        }}
      />
    );
  }

  if (isLoading) {
    return <DashboardSkeleton rows={4} />;
  }

  if (isError || !order) {
    const parsed = parseApiError(error, 'Unable to check order status.');
    return <DashboardErrorState message={parsed.message} onRetry={() => refetch()} />;
  }

  const handleManualRefresh = () => {
    startedAtRef.current = Date.now();
    setPollingStopped(false);
    void refetch();
  };

  return (
    <div className="max-w-[680px] mx-auto space-y-lg">
      <Card className="rounded-xxl shadow-raised border-hairline" styles={{ body: { padding: 32 } }}>
        <div className="space-y-lg">
          <div className="flex items-start justify-between gap-md flex-wrap">
            <div className="space-y-xs">
              <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
                Order Verification
              </span>
              <h1 className="text-[24px] font-bold text-ink m-0">
                {order.status === 'paid'
                  ? 'Payment Confirmed!'
                  : mode === 'cancel' && order.status === 'pending'
                    ? 'Checkout Cancelled — Order Still Pending'
                    : order.status === 'pending'
                      ? 'Confirming Your Payment…'
                      : 'Order Status Updated'}
              </h1>
            </div>
            <StatusBadge label={order.status} />
          </div>

          <div className="rounded-lg bg-surface-subtle border border-border p-md space-y-xs text-[14px]">
            <div className="flex justify-between gap-md">
              <span className="text-ink-muted">Course</span>
              <span className="font-semibold text-ink text-right">{order.courseTitle}</span>
            </div>
            <div className="flex justify-between gap-md">
              <span className="text-ink-muted">Order ID</span>
              <span className="font-mono text-[13px] text-ink">{order.id}</span>
            </div>
            <div className="flex justify-between gap-md">
              <span className="text-ink-muted">Amount</span>
              <span className="font-bold text-ink">{formatEgpAmount(order.amountMinor)}</span>
            </div>
          </div>

          {order.status === 'paid' ? (
            <div className="space-y-md">
              <div className="flex items-center gap-xs text-[14px] text-success-strong font-medium">
                <CheckCircleOutlined />
                <span>Your enrollment is active and ready to start.</span>
              </div>
              <Space wrap>
                <Link to={`/app/my-courses/${order.courseId}`}>
                  <DashboardButton variant="primary">Open Course</DashboardButton>
                </Link>
                <Link to="/app/my-courses">
                  <DashboardButton variant="secondary">Go to My Courses</DashboardButton>
                </Link>
              </Space>
            </div>
          ) : order.status === 'pending' ? (
            <div className="space-y-md">
              <div className="flex items-start gap-xs text-[14px] text-ink-secondary">
                <ClockCircleOutlined className="text-primary mt-1" />
                <span>
                  {pollingStopped
                    ? 'Automatic status checks paused after 2 minutes. Click Refresh Status to check again.'
                    : 'Waiting for payment confirmation from Stripe. This updates automatically — do not submit a duplicate checkout.'}
                </span>
              </div>
              <Space wrap>
                <DashboardButton
                  variant="primary"
                  icon={<ReloadOutlined />}
                  loading={isFetching}
                  onClick={handleManualRefresh}
                >
                  Refresh Status
                </DashboardButton>
                <Link to="/app/orders">
                  <DashboardButton variant="secondary">Order History</DashboardButton>
                </Link>
              </Space>
            </div>
          ) : (
            <div className="space-y-md">
              <p className="text-[14px] text-ink-secondary m-0">
                This order is currently marked as <strong>{order.status}</strong>. Check your Order History or return to the course catalog if you wish to try again.
              </p>
              <Space wrap>
                <Link to={`/app/orders/${order.id}`}>
                  <DashboardButton variant="primary">View Order Details</DashboardButton>
                </Link>
                <Link to="/courses">
                  <DashboardButton variant="secondary">Browse Courses</DashboardButton>
                </Link>
              </Space>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
