import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  DownloadOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import { Card, Tabs } from 'antd';
import { lazy, Suspense, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CurriculumSection,
  DashboardButton,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardSkeleton,
  ProgressBar,
  useDashboardNotify,
} from '@/components/dashboard';
import { useGetLessonPlaybackQuery } from '@/features/catalog/catalogApi';
import { useGetMyLearningCourseQuery, type LearningLessonDto } from '@/features/library/libraryApi';
import {
  useLazyGetAttachmentDownloadUrlQuery,
  useSetLastLessonMutation,
  useSetLessonCompletionMutation,
} from '@/features/player/playerApi';
import { parseApiError } from '@/lib/apiError';

const MuxVideoPlayer = lazy(() =>
  import('@/components/common/MuxVideoPlayer').then((m) => ({
    default: m.MuxVideoPlayer,
  })),
);

export default function CoursePlayerPage() {
  const { courseId = '', lessonId = '' } = useParams();
  const navigate = useNavigate();
  const { message } = useDashboardNotify();

  const { data, isLoading, isError, error, refetch } = useGetMyLearningCourseQuery(
    courseId,
    { skip: !courseId },
  );

  const [triggerDownload, { isFetching: isDownloading }] =
    useLazyGetAttachmentDownloadUrlQuery();
  const [setCompletion, { isLoading: isTogglingCompletion }] =
    useSetLessonCompletionMutation();
  const [setLastLesson] = useSetLastLessonMutation();

  const lastTrackedLessonRef = useRef<string | null>(null);

  const payload = data?.data;

  const activeLesson: LearningLessonDto | null = useMemo(() => {
    if (!payload) return null;
    for (const sec of payload.course.sections) {
      const match = sec.lessons.find((l) => l.id === lessonId);
      if (match) return match;
    }
    for (const sec of payload.course.sections) {
      if (sec.lessons[0]) return sec.lessons[0];
    }
    return null;
  }, [lessonId, payload]);

  const canFetchPlayback = Boolean(activeLesson && activeLesson.videoStatus === 'ready');
  const {
    data: playbackRes,
    isFetching: isPlaybackFetching,
    isError: isPlaybackError,
    error: playbackQueryError,
    refetch: refetchPlayback,
  } = useGetLessonPlaybackQuery(activeLesson?.id ?? '', {
    skip: !canFetchPlayback,
  });

  useEffect(() => {
    if (!activeLesson || !courseId) return;
    if (lastTrackedLessonRef.current !== activeLesson.id) {
      lastTrackedLessonRef.current = activeLesson.id;
      void setLastLesson({ courseId, lessonId: activeLesson.id });
    }
  }, [activeLesson, courseId, setLastLesson]);

  if (isLoading) {
    return <DashboardSkeleton rows={8} />;
  }

  if (isError || !payload) {
    const parsed = parseApiError(error, 'Course is not available.');
    return (
      <DashboardErrorState
        title={parsed.status === 404 ? 'Course Not Available' : 'Unable to Open Player'}
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

  const { course, progress } = payload;

  if (!activeLesson) {
    return (
      <DashboardEmptyState
        title="No lessons found in this course"
        actionLabel="Back to My Courses"
        onAction={() => navigate('/app/my-courses')}
      />
    );
  }

  const playbackCreds = playbackRes?.data ?? null;
  const playbackErrorMsg = (() => {
    if (activeLesson.videoStatus === 'unavailable') {
      return 'This video is currently unavailable.';
    }
    if (activeLesson.videoStatus !== 'ready') {
      return 'Video is not ready for playback yet.';
    }
    if (!isPlaybackError) return null;
    const parsed = parseApiError(playbackQueryError);
    if (parsed.code === 'PLAYBACK_PREPARING' || parsed.status === 503) {
      return 'This video is still preparing. Please wait a moment and retry.';
    }
    if (parsed.status === 429 && parsed.retryAfterSeconds) {
      return `Playback rate limit reached. Retry in ${parsed.retryAfterSeconds}s.`;
    }
    return parsed.message;
  })();

  const handleToggleComplete = async () => {
    try {
      await setCompletion({
        courseId: course.id,
        lessonId: activeLesson.id,
        completed: !activeLesson.completed,
      }).unwrap();
      void message.success(
        activeLesson.completed ? 'Lesson marked incomplete.' : 'Lesson completed!',
      );
    } catch (err) {
      const parsed = parseApiError(err);
      void message.error(
        parsed.status === 429 && parsed.retryAfterSeconds
          ? `Too many updates. Please wait ${parsed.retryAfterSeconds}s.`
          : parsed.message,
      );
    }
  };

  const handleDownloadAttachment = async (assetId: string) => {
    try {
      const res = await triggerDownload({
        lessonId: activeLesson.id,
        assetId,
      }).unwrap();
      // Open temporary signed URL directly; never persist or log it.
      window.open(res.data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      const parsed = parseApiError(err);
      void message.error(
        parsed.status === 429 && parsed.retryAfterSeconds
          ? `Download rate limit reached. Wait ${parsed.retryAfterSeconds}s.`
          : parsed.message,
      );
    }
  };

  return (
    <div className="space-y-lg">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div className="space-y-xxs min-w-0">
          <Link
            to={`/app/my-courses/${course.id}`}
            className="inline-flex items-center gap-xs text-[13px] font-semibold text-primary hover:text-primary-light"
          >
            <ArrowLeftOutlined />
            <span>{course.title}</span>
          </Link>
          <h1 className="text-[20px] font-bold text-ink m-0 truncate">
            {activeLesson.title}
          </h1>
        </div>

        <DashboardButton
          variant={activeLesson.completed ? 'outline' : 'primary'}
          loading={isTogglingCompletion}
          icon={activeLesson.completed ? <CheckCircleFilled /> : undefined}
          onClick={handleToggleComplete}
        >
          {activeLesson.completed ? 'Completed' : 'Mark as Complete'}
        </DashboardButton>
      </div>

      {/* Main grid: Video + tabs left, curriculum sidebar right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg items-start">
        <div className="lg:col-span-2 space-y-lg">
          {isPlaybackFetching ? (
            <div className="aspect-video w-full rounded-lg bg-video-black flex items-center justify-center text-on-primary text-[14px]">
              Loading video…
            </div>
          ) : playbackErrorMsg ? (
            <DashboardErrorState
              title="Video Playback Unavailable"
              message={playbackErrorMsg}
              onRetry={
                activeLesson.videoStatus === 'ready'
                  ? () => void refetchPlayback()
                  : undefined
              }
            />
          ) : playbackCreds ? (
            <Suspense
              fallback={
                <div className="aspect-video w-full rounded-lg bg-video-black" />
              }
            >
              <MuxVideoPlayer
                playbackId={playbackCreds.playbackId}
                token={playbackCreds.token}
                expiresAt={playbackCreds.expiresAt}
                title={activeLesson.title}
                onRenewToken={() => void refetchPlayback()}
              />
            </Suspense>
          ) : (
            <div className="aspect-video w-full rounded-lg bg-video-black flex items-center justify-center text-on-primary/70 text-[14px]">
              No video attached to this lesson.
            </div>
          )}

          <Card className="rounded-lg shadow-card border-hairline">
            <Tabs
              items={[
                {
                  key: 'overview',
                  label: 'Overview',
                  children: activeLesson.description ? (
                    <p className="text-[14px] leading-[1.6] text-ink-secondary whitespace-pre-line m-0">
                      {activeLesson.description}
                    </p>
                  ) : (
                    <p className="text-[14px] text-ink-muted m-0">
                      No additional notes for this lesson.
                    </p>
                  ),
                },
                {
                  key: 'resources',
                  label: `Resources (${activeLesson.attachments.length})`,
                  children:
                    activeLesson.attachments.length === 0 ? (
                      <p className="text-[14px] text-ink-muted m-0">
                        No downloadable resources for this lesson.
                      </p>
                    ) : (
                      <div className="space-y-xs">
                        {activeLesson.attachments.map((assetId, idx) => (
                          <div
                            key={assetId}
                            className="flex items-center justify-between gap-md rounded-lg border border-border bg-surface px-md py-sm"
                          >
                            <div className="flex items-center gap-sm min-w-0">
                              <div className="h-9 w-9 rounded-md bg-tint-rose text-error flex items-center justify-center shrink-0">
                                <FilePdfOutlined />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[14px] font-semibold text-ink m-0 truncate">
                                  Lesson Resource {idx + 1} (PDF)
                                </p>
                                <p className="text-[12px] text-ink-muted m-0">
                                  Temporary signed download link (60s)
                                </p>
                              </div>
                            </div>
                            <DashboardButton
                              variant="outline"
                              size="small"
                              loading={isDownloading}
                              icon={<DownloadOutlined />}
                              onClick={() => handleDownloadAttachment(assetId)}
                            >
                              Download
                            </DashboardButton>
                          </div>
                        ))}
                      </div>
                    ),
                },
              ]}
            />
          </Card>
        </div>

        {/* Curriculum sidebar */}
        <aside className="space-y-md">
          <Card className="rounded-lg shadow-card border-hairline" styles={{ body: { padding: 16 } }}>
            <ProgressBar
              percent={progress.percentage}
              completedCount={progress.completedLessons}
              totalCount={progress.totalLessons}
            />
          </Card>

          <div className="space-y-sm">
            {course.sections.map((section) => (
              <CurriculumSection
                key={section.id}
                title={section.title}
                lessons={section.lessons.map((lesson) => ({
                  id: lesson.id,
                  title: lesson.title,
                  durationSeconds: lesson.durationSeconds,
                  hasAttachment: lesson.attachments.length > 0,
                  state:
                    lesson.id === activeLesson.id
                      ? 'current'
                      : lesson.completed
                        ? 'completed'
                        : 'future',
                }))}
                onSelectLesson={(lesson) =>
                  navigate(`/app/my-courses/${course.id}/learn/${lesson.id}`)
                }
              />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
