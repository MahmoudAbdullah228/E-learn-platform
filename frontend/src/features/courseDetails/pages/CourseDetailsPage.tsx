import { BookOpen, CheckCircle2, ChevronRight, Globe, Layers } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import {
  CategoryTag,
  InstructorCard,
  PublicCurriculumOutline,
  PublicErrorStateCard,
  PublicModal,
  PublicSkeleton,
  PurchaseCard,
  usePublicToast,
  type PublicOutlineLesson,
} from '@/components/public';
import {
  useGetCourseBySlugQuery,
  useLazyGetLessonPlaybackQuery,
  type PlaybackCredentials,
} from '@/features/catalog/catalogApi';
import {
  useEnrollFreeCourseMutation,
  useStartCourseCheckoutMutation,
} from '@/features/checkout/checkoutApi';
import { parseApiError } from '@/lib/apiError';
import { formatDuration } from '@/lib/formatters';
import { useCooldown } from '@/lib/useCooldown';

const MuxVideoPlayer = lazy(() =>
  import('@/components/common/MuxVideoPlayer').then((m) => ({
    default: m.MuxVideoPlayer,
  })),
);

export const PENDING_ORDER_STORAGE_KEY = 'pathly_pending_order_id';

export function CourseDetailsPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { showToast } = usePublicToast();
  const user = useAppSelector((state) => state.auth.user);
  const { secondsLeft, isCoolingDown, startCooldown } = useCooldown();

  const { data, isLoading, isError, error, refetch } = useGetCourseBySlugQuery(slug, {
    skip: !slug,
  });

  const [triggerPlayback, { isFetching: isPlaybackLoading }] =
    useLazyGetLessonPlaybackQuery();
  const [startCheckout, { isLoading: isCheckoutLoading }] =
    useStartCourseCheckoutMutation();
  const [enrollFree, { isLoading: isEnrolling }] = useEnrollFreeCourseMutation();

  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewLesson, setPreviewLesson] = useState<PublicOutlineLesson | null>(null);
  const [playbackCreds, setPlaybackCreds] = useState<PlaybackCredentials | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const course = data?.data?.course;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1200px] px-md md:px-xxl py-xxl space-y-xl">
        <PublicSkeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-xl">
          <div className="lg:col-span-2 space-y-lg">
            <PublicSkeleton className="h-56 rounded-xxl" />
            <PublicSkeleton className="h-72 rounded-xxl" />
          </div>
          <PublicSkeleton className="h-96 rounded-xxl" />
        </div>
      </div>
    );
  }

  if (isError || !course) {
    const parsed = parseApiError(error, 'Course was not found.');
    return (
      <div className="mx-auto max-w-[720px] px-md py-section">
        <PublicErrorStateCard
          title={parsed.status === 404 ? 'Course Not Found' : 'Unable to load course'}
          message={parsed.message}
          onRetry={parsed.status === 404 ? () => navigate('/courses') : () => refetch()}
          retryLabel={parsed.status === 404 ? 'Browse Catalog' : 'Try Again'}
        />
      </div>
    );
  }

  const firstPreviewLesson: PublicOutlineLesson | null = (() => {
    for (const sec of course.sections) {
      const found = sec.lessons.find((l) => l.isPreview);
      if (found) return found;
    }
    return null;
  })();

  const loadPreviewPlayback = async (lesson: PublicOutlineLesson) => {
    if (!lesson.isPreview) {
      showToast('This lesson requires enrollment to watch.', 'info');
      return;
    }

    setPreviewLesson(lesson);
    setPlaybackCreds(null);
    setPlaybackError(null);
    setPreviewModalOpen(true);

    try {
      const res = await triggerPlayback(lesson.id).unwrap();
      setPlaybackCreds(res.data);
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed.code === 'PLAYBACK_PREPARING' || parsed.status === 503) {
        setPlaybackError('This preview video is still preparing. Please try again in a moment.');
      } else if (parsed.status === 429 && parsed.retryAfterSeconds) {
        setPlaybackError(
          `Too many preview requests. Please wait ${parsed.retryAfterSeconds} seconds and retry.`,
        );
      } else {
        setPlaybackError(parsed.message);
      }
    }
  };

  const handlePrimaryPurchaseCta = async () => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(`/courses/${course.slug}`)}`);
      return;
    }

    if (course.priceMinor === 0) {
      try {
        await enrollFree(course.id).unwrap();
        showToast('Enrolled! Opening your course.', 'success');
        navigate(`/app/my-courses/${course.id}`);
      } catch (err) {
        const parsed = parseApiError(err);
        if (parsed.status === 429) {
          startCooldown(parsed.retryAfterSeconds ?? 60);
        }
        showToast(parsed.message, 'error');
      }
      return;
    }

    try {
      const res = await startCheckout(course.id).unwrap();
      try {
        sessionStorage.setItem(PENDING_ORDER_STORAGE_KEY, res.data.order.id);
      } catch {
        // Ignore storage errors if blocked
      }
      window.location.assign(res.data.checkoutUrl);
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed.status === 429) {
        startCooldown(parsed.retryAfterSeconds ?? 60);
      }
      if (parsed.code === 'PAYMENT_PENDING') {
        showToast(
          'An existing purchase attempt for this course is in progress. Please wait or check Order History.',
          'info',
        );
      } else if (parsed.code === 'PAYMENT_RECONCILIATION_REQUIRED') {
        showToast(
          'A prior payment attempt requires reconciliation. Please check your Order History before retrying.',
          'error',
        );
      } else {
        showToast(parsed.message, 'error');
      }
    }
  };

  const levelLabels: Record<string, string> = {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
    all_levels: 'All Levels',
  };

  const languageLabels: Record<string, string> = {
    ar: 'Arabic',
    en: 'English',
  };

  const durationText =
    course.totalDurationSeconds === null
      ? 'Duration unavailable'
      : formatDuration(course.totalDurationSeconds);

  const ctaLabel = isCoolingDown
    ? `Please wait ${secondsLeft}s`
    : course.priceMinor === 0
      ? 'Enroll for Free'
      : 'Purchase Course';

  return (
    <div className="mx-auto max-w-[1200px] px-md md:px-xxl py-xxl space-y-xl">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-xs text-[13px] text-ink-muted flex-wrap">
        <Link to="/" className="hover:text-primary transition-colors">
          Home
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link to="/courses" className="hover:text-primary transition-colors">
          Courses
        </Link>
        {course.category && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link
              to={`/courses?categoryId=${encodeURIComponent(course.category.id)}`}
              className="hover:text-primary transition-colors"
            >
              {course.category.name}
            </Link>
          </>
        )}
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-ink font-medium truncate max-w-[260px]">{course.title}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-xl items-start">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-xl">
          <section className="bg-surface rounded-xxl p-xxl shadow-card border border-hairline space-y-md">
            <div className="flex flex-wrap items-center gap-xs">
              {course.category && <CategoryTag>{course.category.name}</CategoryTag>}
              {course.level && (
                <CategoryTag>{levelLabels[course.level] ?? course.level}</CategoryTag>
              )}
              {course.language && (
                <CategoryTag>{languageLabels[course.language] ?? course.language}</CategoryTag>
              )}
            </div>

            <h1 className="text-[32px] font-bold leading-[1.25] text-ink">
              {course.title}
            </h1>

            {course.shortDescription && (
              <p className="text-[16px] leading-[1.6] text-ink-secondary">
                {course.shortDescription}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-lg pt-xs text-[13px] text-ink-muted border-t border-hairline">
              <span className="inline-flex items-center gap-xs">
                <Layers className="h-4 w-4 text-primary" />
                {course.sectionCount} {course.sectionCount === 1 ? 'Section' : 'Sections'} •{' '}
                {course.lessonCount} {course.lessonCount === 1 ? 'Lesson' : 'Lessons'}
              </span>
              <span className="inline-flex items-center gap-xs">
                <BookOpen className="h-4 w-4 text-primary" />
                {durationText}
              </span>
              {course.language && (
                <span className="inline-flex items-center gap-xs">
                  <Globe className="h-4 w-4 text-primary" />
                  {languageLabels[course.language] ?? course.language}
                </span>
              )}
            </div>

            {course.unknownDurationCount > 0 && (
              <p className="text-[12px] text-ink-muted">
                Note: {course.unknownDurationCount}{' '}
                {course.unknownDurationCount === 1 ? 'lesson does' : 'lessons do'} not yet have a confirmed duration.
              </p>
            )}
          </section>

          {course.learningOutcomes.length > 0 && (
            <section className="bg-surface rounded-xxl p-xxl shadow-card border border-hairline space-y-md">
              <h2 className="text-[20px] font-bold text-ink">What You&apos;ll Learn</h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
                {course.learningOutcomes.map((outcome) => (
                  <li key={outcome} className="flex items-start gap-sm text-[14px] text-ink">
                    <CheckCircle2 className="h-4 w-4 text-primary-soft shrink-0 mt-1" />
                    <span>{outcome}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {course.requirements.length > 0 && (
            <section className="bg-surface rounded-xxl p-xxl shadow-card border border-hairline space-y-md">
              <h2 className="text-[20px] font-bold text-ink">Prerequisites</h2>
              <ul className="list-disc pl-lg space-y-xs text-[14px] text-ink-secondary">
                {course.requirements.map((req) => (
                  <li key={req}>{req}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="bg-surface rounded-xxl p-xxl shadow-card border border-hairline space-y-md">
            <h2 className="text-[20px] font-bold text-ink">About This Course</h2>
            <div className="text-[14px] leading-[1.7] text-ink-secondary whitespace-pre-line">
              {course.description}
            </div>
          </section>

          <section className="bg-surface rounded-xxl p-xxl shadow-card border border-hairline space-y-md">
            <div className="flex flex-wrap items-center justify-between gap-xs">
              <h2 className="text-[24px] font-bold text-ink">Course Curriculum</h2>
              <span className="text-[13px] text-ink-muted">
                {course.sectionCount} sections • {course.lessonCount} lessons • {durationText}
              </span>
            </div>
            <PublicCurriculumOutline
              sections={course.sections}
              onPreviewLesson={loadPreviewPlayback}
            />
          </section>

          {course.instructor && (
            <section className="space-y-sm">
              <h2 className="text-[20px] font-bold text-ink">Your Instructor</h2>
              <InstructorCard
                instructorId={course.instructor.id}
                name={course.instructor.name}
                expertise={course.instructor.expertise}
                bio={course.instructor.bio}
              />
            </section>
          )}
        </div>

        {/* Sticky Purchase Card */}
        <div className="lg:sticky lg:top-24">
          <PurchaseCard
            priceMinor={course.priceMinor}
            coverUrl={course.coverUrl}
            courseTitle={course.title}
            ctaLabel={ctaLabel}
            ctaLoading={isCheckoutLoading || isEnrolling}
            ctaDisabled={isCoolingDown}
            onCtaClick={handlePrimaryPurchaseCta}
            hasPreview={Boolean(firstPreviewLesson)}
            onPreviewClick={
              firstPreviewLesson
                ? () => loadPreviewPlayback(firstPreviewLesson)
                : undefined
            }
          />
        </div>
      </div>

      {/* Preview playback modal */}
      <PublicModal
        open={previewModalOpen}
        onOpenChange={setPreviewModalOpen}
        title={previewLesson ? `Preview: ${previewLesson.title}` : 'Course Preview'}
        maxWidthClass="max-w-[760px]"
      >
        {isPlaybackLoading ? (
          <PublicSkeleton className="aspect-video w-full rounded-lg" />
        ) : playbackError ? (
          <PublicErrorStateCard
            message={playbackError}
            onRetry={
              previewLesson ? () => loadPreviewPlayback(previewLesson) : undefined
            }
          />
        ) : playbackCreds ? (
          <Suspense fallback={<PublicSkeleton className="aspect-video w-full rounded-lg" />}>
            <MuxVideoPlayer
              playbackId={playbackCreds.playbackId}
              token={playbackCreds.token}
              expiresAt={playbackCreds.expiresAt}
              title={previewLesson?.title}
              onRenewToken={() => {
                if (previewLesson) void loadPreviewPlayback(previewLesson);
              }}
            />
          </Suspense>
        ) : null}
      </PublicModal>
    </div>
  );
}
