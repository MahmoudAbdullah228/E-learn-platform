import {
  BookOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { Card } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import {
  DashboardButton,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardSkeleton,
  LearningCourseRow,
  MetricCard,
} from '@/components/dashboard';
import { useListCatalogCoursesQuery } from '@/features/catalog/catalogApi';
import { useListMyCoursesQuery } from '@/features/library/libraryApi';
import { parseApiError } from '@/lib/apiError';
import { formatEgpPrice } from '@/lib/formatters';

export default function StudentDashboardPage() {
  const navigate = useNavigate();
  const user = useAppSelector((state) => state.auth.user);

  const {
    data: libraryRes,
    isLoading: isLibraryLoading,
    isError: isLibraryError,
    error: libraryError,
    refetch,
  } = useListMyCoursesQuery({ status: 'active', page: 1, limit: 50 });

  const { data: recommendedRes } = useListCatalogCoursesQuery({
    page: 1,
    limit: 3,
    pricing: 'all',
  });

  if (isLibraryLoading) {
    return <DashboardSkeleton rows={6} />;
  }

  if (isLibraryError) {
    return (
      <DashboardErrorState
        message={parseApiError(libraryError).message}
        onRetry={() => refetch()}
      />
    );
  }

  const entries = libraryRes?.data?.courses ?? [];
  const availableEntries = entries.filter((e) => e.available && e.course);
  const completedCount = availableEntries.filter(
    (e) => (e.progress?.percentage ?? 0) >= 100,
  ).length;
  const inProgressEntries = availableEntries.filter(
    (e) => (e.progress?.percentage ?? 0) < 100,
  );
  const averageProgress =
    availableEntries.length > 0
      ? Math.round(
          availableEntries.reduce(
            (sum, entry) => sum + (entry.progress?.percentage ?? 0),
            0,
          ) / availableEntries.length,
        )
      : 0;

  const enrolledIds = new Set(entries.map((e) => e.enrollment.courseId));
  const recommendedCourses = (recommendedRes?.data?.courses ?? []).filter(
    (c) => !enrolledIds.has(c.id),
  );

  return (
    <div className="space-y-xl">
      <div>
        <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
          Student Workspace
        </span>
        <h1 className="text-[24px] font-bold text-ink mt-xxs">
          Welcome back{user?.name ? `, ${user.name}` : ''}!
        </h1>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-md">
        <MetricCard
          label="Enrolled Courses"
          value={availableEntries.length}
          icon={<BookOutlined />}
          iconTone="teal"
        />
        <MetricCard
          label="In Progress"
          value={inProgressEntries.length}
          icon={<ClockCircleOutlined />}
          iconTone="blue"
        />
        <MetricCard
          label="Completed"
          value={completedCount}
          icon={<CheckCircleOutlined />}
          iconTone="green"
        />
        <MetricCard
          label="Overall Progress"
          value={`${averageProgress}%`}
          progressPercent={averageProgress}
        />
      </div>

      {/* Continue Learning */}
      <section className="space-y-md">
        <div className="flex items-center justify-between gap-md">
          <h2 className="text-[20px] font-bold text-ink m-0">Continue Learning</h2>
          <Link
            to="/app/my-courses"
            className="text-[14px] font-semibold text-primary hover:text-primary-light"
          >
            View All →
          </Link>
        </div>

        {inProgressEntries.length === 0 ? (
          <DashboardEmptyState
            title="No courses in progress"
            description="Explore the catalog to enroll in your next course."
            actionLabel="Explore Courses"
            onAction={() => navigate('/courses')}
          />
        ) : (
          <div className="space-y-sm">
            {inProgressEntries.slice(0, 4).map((entry) => {
              const course = entry.course!;
              const targetUrl = entry.enrollment.lastLessonId
                ? `/app/my-courses/${course.id}/learn/${entry.enrollment.lastLessonId}`
                : `/app/my-courses/${course.id}`;
              return (
                <LearningCourseRow
                  key={entry.enrollment.id}
                  title={course.title}
                  instructorName="Pathly Course"
                  coverUrl={course.coverUrl}
                  progressPercent={entry.progress?.percentage ?? 0}
                  completedLessons={entry.progress?.completedLessons ?? 0}
                  totalLessons={entry.progress?.totalLessons ?? 0}
                  onContinue={() => navigate(targetUrl)}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Recommended for You */}
      {recommendedCourses.length > 0 && (
        <section className="space-y-md">
          <div className="flex items-center justify-between gap-md">
            <h2 className="text-[20px] font-bold text-ink m-0">Recommended for You</h2>
            <Link
              to="/courses"
              className="text-[14px] font-semibold text-primary hover:text-primary-light"
            >
              Browse Catalog →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
            {recommendedCourses.slice(0, 3).map((course) => (
              <Card
                key={course.id}
                className="rounded-lg shadow-card border-hairline overflow-hidden flex flex-col"
                styles={{ body: { padding: 14, display: 'flex', flexDirection: 'column', flex: 1 } }}
              >
                <div className="aspect-video rounded-md overflow-hidden bg-primary-tint flex items-center justify-center mb-sm">
                  {course.coverUrl ? (
                    <img
                      src={course.coverUrl}
                      alt={course.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <BookOutlined className="text-[24px] text-primary" />
                  )}
                </div>
                <div className="flex-1 flex flex-col justify-between gap-sm">
                  <div>
                    <h3 className="text-[16px] font-semibold text-ink line-clamp-2 m-0">
                      {course.title}
                    </h3>
                    <p className="text-[12px] text-ink-muted mt-xxs mb-0">
                      By {course.instructor?.name ?? 'Pathly Instructor'}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-xs pt-xs border-t border-hairline">
                    <span className="text-[16px] font-bold text-ink">
                      {formatEgpPrice(course.priceMinor)}
                    </span>
                    <Link to={`/courses/${course.slug}`}>
                      <DashboardButton variant="outline" size="small">
                        View Details
                      </DashboardButton>
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
