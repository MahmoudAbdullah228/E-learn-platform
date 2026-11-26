import { ArrowLeftOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { Card } from 'antd';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CurriculumSection,
  DashboardButton,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardSkeleton,
  ProgressBar,
} from '@/components/dashboard';
import { useGetMyLearningCourseQuery } from '@/features/library/libraryApi';
import { parseApiError } from '@/lib/apiError';

export default function CourseOutlinePage() {
  const { courseId = '' } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, isError, error, refetch } = useGetMyLearningCourseQuery(
    courseId,
    { skip: !courseId },
  );

  if (isLoading) {
    return <DashboardSkeleton rows={6} />;
  }

  const payload = data?.data;

  if (isError || !payload) {
    const parsed = parseApiError(error, 'This course is not available.');
    return (
      <DashboardErrorState
        title={parsed.status === 404 ? 'Course Not Available' : 'Unable to Load Course'}
        message={
          parsed.status === 404
            ? 'This course was not found in your active enrollments.'
            : parsed.message
        }
        onRetry={
          parsed.status === 404 ? () => navigate('/app/my-courses') : () => refetch()
        }
        retryLabel={parsed.status === 404 ? 'Back to My Courses' : 'Try Again'}
      />
    );
  }

  const { course, enrollment, progress } = payload;

  const firstLessonId = (() => {
    for (const sec of course.sections) {
      if (sec.lessons[0]) return sec.lessons[0].id;
    }
    return null;
  })();

  const resumeLessonId = enrollment.lastLessonId ?? firstLessonId;

  return (
    <div className="space-y-xl">
      <Link
        to="/app/my-courses"
        className="inline-flex items-center gap-xs text-[14px] font-semibold text-primary hover:text-primary-light"
      >
        <ArrowLeftOutlined />
        <span>Back to My Courses</span>
      </Link>

      <Card className="rounded-xxl shadow-card border-hairline" styles={{ body: { padding: 24 } }}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-lg">
          <div className="space-y-sm flex-1 min-w-0">
            <h1 className="text-[24px] font-bold text-ink m-0">{course.title}</h1>
            {course.shortDescription && (
              <p className="text-[14px] text-ink-secondary m-0">
                {course.shortDescription}
              </p>
            )}
            <div className="max-w-[420px] pt-xs">
              <ProgressBar
                percent={progress.percentage}
                completedCount={progress.completedLessons}
                totalCount={progress.totalLessons}
              />
            </div>
          </div>

          {resumeLessonId && (
            <DashboardButton
              variant="primary-lg"
              icon={<PlayCircleOutlined />}
              onClick={() =>
                navigate(`/app/my-courses/${course.id}/learn/${resumeLessonId}`)
              }
            >
              {enrollment.lastLessonId ? 'Resume Learning' : 'Start Learning'}
            </DashboardButton>
          )}
        </div>
      </Card>

      <section className="space-y-md">
        <h2 className="text-[20px] font-bold text-ink m-0">Course Curriculum</h2>
        {course.sections.length === 0 ? (
          <DashboardEmptyState
            title="No lessons available yet"
            description="Check back soon for curriculum updates."
          />
        ) : (
          <div className="space-y-sm">
            {course.sections.map((section) => (
              <CurriculumSection
                key={section.id}
                title={section.title}
                lessons={section.lessons.map((lesson) => ({
                  id: lesson.id,
                  title: lesson.title,
                  durationSeconds: lesson.durationSeconds,
                  isPreview: lesson.isPreview,
                  hasAttachment: lesson.attachments.length > 0,
                  state: lesson.completed
                    ? 'completed'
                    : lesson.id === enrollment.lastLessonId
                      ? 'current'
                      : 'future',
                }))}
                onSelectLesson={(lesson) =>
                  navigate(`/app/my-courses/${course.id}/learn/${lesson.id}`)
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
