import {
  AuditOutlined,
  BookOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Card } from 'antd';
import { Link } from 'react-router-dom';
import {
  DashboardButton,
  DashboardErrorState,
  DashboardSkeleton,
  MetricCard,
} from '@/components/dashboard';
import { useGetAdminDashboardQuery } from '@/features/adminUsers/adminUsersApi';
import { parseApiError } from '@/lib/apiError';
import { formatEgpAmount } from '@/lib/formatters';

export default function AdminDashboardPage() {
  const { data, isLoading, isError, error, refetch } = useGetAdminDashboardQuery({
    currency: 'EGP',
  });

  if (isLoading) {
    return <DashboardSkeleton rows={6} />;
  }

  if (isError || !data?.data) {
    return (
      <DashboardErrorState
        message={parseApiError(error, 'Unable to load admin dashboard.').message}
        onRetry={() => refetch()}
      />
    );
  }

  const { users, courses, finance } = data.data;

  return (
    <div className="space-y-xl">
      <div>
        <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
          Platform Overview
        </span>
        <h1 className="text-[24px] font-bold text-ink mt-xxs">Admin Dashboard</h1>
      </div>

      {/* Operations metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-md">
        <MetricCard
          label="Pending Applications"
          value={users.pendingApplications}
          icon={<AuditOutlined />}
          iconTone="teal"
        />
        <MetricCard
          label="Pending Course Reviews"
          value={courses.pendingReview}
          icon={<BookOutlined />}
          iconTone="blue"
        />
        <MetricCard
          label="Published Courses"
          value={courses.published}
          icon={<CheckCircleOutlined />}
          iconTone="green"
        />
        <MetricCard
          label="Active Users"
          value={users.active}
          icon={<TeamOutlined />}
          iconTone="teal"
        />
      </div>

      {/* Finance metrics (30-day default window) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-md">
        <MetricCard
          label="Net Sales (30d)"
          value={formatEgpAmount(finance.netSalesMinor)}
          icon={<DollarOutlined />}
          iconTone="green"
        />
        <MetricCard
          label="Platform Commission Net"
          value={formatEgpAmount(finance.platformCommissionNetMinor)}
          icon={<DollarOutlined />}
          iconTone="teal"
        />
        <MetricCard
          label="Eligible Unpaid Instructor Earnings"
          value={formatEgpAmount(finance.eligibleAvailableMinor)}
          icon={<DollarOutlined />}
          iconTone="blue"
        />
        <MetricCard
          label="Active Financial Holds"
          value={finance.activeHoldCount}
          icon={<AuditOutlined />}
          iconTone="rose"
        />
      </div>

      {/* Quick queues */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
        <Card className="rounded-lg shadow-card border-hairline" styles={{ body: { padding: 20 } }}>
          <h2 className="text-[18px] font-semibold text-ink mb-xs">
            Instructor Applications
          </h2>
          <p className="text-[14px] text-ink-secondary mb-md">
            {users.pendingApplications} pending instructor review(s).
          </p>
          <Link to="/admin/instructor-applications">
            <DashboardButton variant="primary">Review Applications</DashboardButton>
          </Link>
        </Card>

        <Card className="rounded-lg shadow-card border-hairline" styles={{ body: { padding: 20 } }}>
          <h2 className="text-[18px] font-semibold text-ink mb-xs">
            Course Moderation
          </h2>
          <p className="text-[14px] text-ink-secondary mb-md">
            {courses.pendingReview} new draft(s) awaiting review. Also inspect published-course revisions.
          </p>
          <Link to="/admin/courses">
            <DashboardButton variant="primary">Review Courses</DashboardButton>
          </Link>
        </Card>

        <Card className="rounded-lg shadow-card border-hairline" styles={{ body: { padding: 20 } }}>
          <h2 className="text-[18px] font-semibold text-ink mb-xs">
            Finance, Payouts &amp; Refunds
          </h2>
          <p className="text-[14px] text-ink-secondary mb-md">
            Manage instructor payouts, review refund requests, and audit platform balances.
          </p>
          <Link to="/admin/finance">
            <DashboardButton variant="outline">Open Finance Console</DashboardButton>
          </Link>
        </Card>
      </div>
    </div>
  );
}
