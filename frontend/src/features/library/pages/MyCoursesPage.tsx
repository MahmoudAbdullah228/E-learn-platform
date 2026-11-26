import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DashboardEmptyState,
  DashboardErrorState,
  DashboardSkeleton,
  SegmentedFilter,
  StudentCourseCard,
} from '@/components/dashboard';
import { useListMyCoursesQuery } from '@/features/library/libraryApi';
import { parseApiError } from '@/lib/apiError';

type LibrarySegment = 'all' | 'in_progress' | 'completed' | 'revoked';

export default function MyCoursesPage() {
  const navigate = useNavigate();
  const [segment, setSegment] = useState<LibrarySegment>('all');

  const { data, isLoading, isError, error, refetch } = useListMyCoursesQuery({
    status: 'all',
    page: 1,
    limit: 50,
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

  const entries = data?.data?.courses ?? [];

  const filtered = entries.filter((entry) => {
    const pct = entry.progress?.percentage ?? 0;
    if (segment === 'revoked') {
      return entry.enrollment.status === 'revoked' || !entry.available;
    }
    if (segment === 'completed') {
      return entry.available && pct >= 100;
    }
    if (segment === 'in_progress') {
      return entry.available && pct < 100;
    }
    return true;
  });

  return (
    <div className="space-y-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-md">
        <div>
          <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
            Learning Library
          </span>
          <h1 className="text-[24px] font-bold text-ink mt-xxs">My Courses</h1>
        </div>

        <SegmentedFilter<LibrarySegment>
          value={segment}
          onChange={setSegment}
          options={[
            { label: 'All Courses', value: 'all' },
            { label: 'In Progress', value: 'in_progress' },
            { label: 'Completed', value: 'completed' },
            { label: 'Revoked', value: 'revoked' },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <DashboardEmptyState
          title="No courses in this view"
          description={
            segment === 'all'
              ? 'You have not enrolled in any courses yet.'
              : 'No courses match this filter right now.'
          }
          actionLabel={segment === 'all' ? 'Explore Courses' : 'Show All Courses'}
          onAction={() =>
            segment === 'all' ? navigate('/courses') : setSegment('all')
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
          {filtered.map((entry) => {
            const title = entry.course?.title ?? 'Course Unavailable';
            return (
              <StudentCourseCard
                key={entry.enrollment.id}
                title={title}
                instructorName={
                  entry.enrollment.revocationReason === 'refund'
                    ? 'Refunded enrollment'
                    : 'Enrolled Course'
                }
                coverUrl={entry.course?.coverUrl}
                progressPercent={entry.progress?.percentage ?? 0}
                completedLessons={entry.progress?.completedLessons ?? 0}
                totalLessons={entry.progress?.totalLessons ?? 0}
                unavailable={!entry.available || !entry.course}
                onAction={() => {
                  if (entry.course) {
                    navigate(`/app/my-courses/${entry.course.id}`);
                  }
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
