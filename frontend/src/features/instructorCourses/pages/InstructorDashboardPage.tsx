import {
  BookOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { Card } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import {
  DashboardButton,
  DashboardSkeleton,
  MetricCard,
} from '@/components/dashboard';
import { useListInstructorCoursesQuery } from '@/features/instructorCourses/instructorCoursesApi';

export default function InstructorDashboardPage() {
  const navigate = useNavigate();
  const user = useAppSelector((state) => state.auth.user);

  const drafts = useListInstructorCoursesQuery({ status: 'draft', page: 1, limit: 1 });
  const pending = useListInstructorCoursesQuery({ status: 'pending_review', page: 1, limit: 1 });
  const published = useListInstructorCoursesQuery({ status: 'published', page: 1, limit: 1 });
  const rejected = useListInstructorCoursesQuery({ status: 'rejected', page: 1, limit: 1 });
  const unavailable = useListInstructorCoursesQuery({ status: 'unavailable', page: 1, limit: 1 });

  const isLoading =
    drafts.isLoading ||
    pending.isLoading ||
    published.isLoading ||
    rejected.isLoading ||
    unavailable.isLoading;

  if (isLoading) {
    return <DashboardSkeleton rows={5} />;
  }

  const draftCount = drafts.data?.data?.pagination.total ?? 0;
  const pendingCount = pending.data?.data?.pagination.total ?? 0;
  const publishedCount = published.data?.data?.pagination.total ?? 0;
  const attentionCount =
    (rejected.data?.data?.pagination.total ?? 0) +
    (unavailable.data?.data?.pagination.total ?? 0);

  return (
    <div className="space-y-xl">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
            Instructor Studio
          </span>
          <h1 className="text-[24px] font-bold text-ink mt-xxs">
            Welcome, {user?.name ?? 'Instructor'}
          </h1>
        </div>
        <DashboardButton
          variant="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate('/instructor/courses/new')}
        >
          Create Course
        </DashboardButton>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-md">
        <MetricCard
          label="Draft Courses"
          value={draftCount}
          icon={<BookOutlined />}
          iconTone="teal"
        />
        <MetricCard
          label="Pending Review"
          value={pendingCount}
          icon={<ClockCircleOutlined />}
          iconTone="blue"
        />
        <MetricCard
          label="Published Courses"
          value={publishedCount}
          icon={<CheckCircleOutlined />}
          iconTone="green"
        />
        <MetricCard
          label="Needs Attention"
          value={attentionCount}
          icon={<ExclamationCircleOutlined />}
          iconTone="rose"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <Card className="rounded-lg shadow-card border-hairline" styles={{ body: { padding: 20 } }}>
          <h2 className="text-[18px] font-semibold text-ink mb-xs">Manage Your Courses</h2>
          <p className="text-[14px] text-ink-secondary mb-md">
            Build draft curricula, upload lesson videos via Mux, attach PDFs, and submit for review.
          </p>
          <Link to="/instructor/courses">
            <DashboardButton variant="outline">View All Courses</DashboardButton>
          </Link>
        </Card>

        <Card className="rounded-lg shadow-card border-hairline" styles={{ body: { padding: 20 } }}>
          <h2 className="text-[18px] font-semibold text-ink mb-xs">Finance &amp; Settlements</h2>
          <p className="text-[14px] text-ink-secondary mb-md">
            Track your course sales, 80% instructor earnings ledger, and payout history.
          </p>
          <Link to="/instructor/finance">
            <DashboardButton variant="outline">Open Instructor Finance</DashboardButton>
          </Link>
        </Card>
      </div>
    </div>
  );
}
