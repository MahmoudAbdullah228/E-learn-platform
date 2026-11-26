import { ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, Card, Descriptions, Input, Space } from 'antd';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CurriculumSection,
  DashboardButton,
  DashboardErrorState,
  DashboardSkeleton,
  StatusBadge,
  useDashboardNotify,
} from '@/components/dashboard';
import {
  useArchiveAdminCourseMutation,
  useChangeAdminCourseAccessPolicyMutation,
  useGetAdminCourseDetailQuery,
  useReviewAdminCourseMutation,
} from '@/features/adminCourses/adminCoursesApi';
import { parseApiError } from '@/lib/apiError';
import { formatEgpPrice } from '@/lib/formatters';
import { rejectionReasonSchema } from '@/lib/validation';

export default function AdminCourseDetailPage() {
  const { courseId = '' } = useParams();
  const { message } = useDashboardNotify();

  const { data, isLoading, isError, error, refetch } =
    useGetAdminCourseDetailQuery(courseId, { skip: !courseId });

  const [reviewCourse, { isLoading: isReviewing }] =
    useReviewAdminCourseMutation();
  const [archiveCourse, { isLoading: isArchiving }] =
    useArchiveAdminCourseMutation();
  const [changeAccessPolicy, { isLoading: isChangingAccess }] =
    useChangeAdminCourseAccessPolicyMutation();

  const [rejectReason, setRejectReason] = useState('');
  const [adminActionReason, setAdminActionReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) {
    return <DashboardSkeleton rows={7} />;
  }

  const payload = data?.data;

  if (isError || !payload) {
    return (
      <DashboardErrorState
        message={parseApiError(error, 'Course was not found.').message}
        onRetry={() => refetch()}
      />
    );
  }

  const { course, instructor, sections, reviewEvents } = payload;

  const handleApprove = async () => {
    setActionError(null);
    try {
      await reviewCourse({
        courseId: course.id,
        body: { decision: 'approve' },
      }).unwrap();
      void message.success('Course approved and published.');
    } catch (err) {
      const parsed = parseApiError(err);
      setActionError(parsed.message);
      if (parsed.code === 'INVALID_COURSE_STATE') void refetch();
    }
  };

  const handleReject = async () => {
    setActionError(null);
    const parsedReason = rejectionReasonSchema.safeParse(rejectReason);
    if (!parsedReason.success) {
      setActionError(parsedReason.error.issues[0]?.message ?? 'Invalid reason');
      return;
    }
    try {
      await reviewCourse({
        courseId: course.id,
        body: { decision: 'reject', reason: parsedReason.data },
      }).unwrap();
      setRejectReason('');
      void message.success('Course rejected.');
    } catch (err) {
      const parsed = parseApiError(err);
      setActionError(parsed.message);
      if (parsed.code === 'INVALID_COURSE_STATE') void refetch();
    }
  };

  const validateAdminReason = (): string | null => {
    const trimmed = adminActionReason.trim();
    if (trimmed.length < 10 || trimmed.length > 500) {
      setActionError('Administration reason must be 10 to 500 characters.');
      return null;
    }
    return trimmed;
  };

  const handleArchive = async () => {
    setActionError(null);
    const reason = validateAdminReason();
    if (!reason) return;
    try {
      await archiveCourse({
        courseId: course.id,
        reason,
        expectedRevision: course.revision,
      }).unwrap();
      setAdminActionReason('');
      void message.success('Course archived.');
    } catch (err) {
      setActionError(parseApiError(err).message);
    }
  };

  const handleAccessPolicy = async (accessStatus: 'available' | 'blocked') => {
    setActionError(null);
    const reason = validateAdminReason();
    if (!reason) return;
    try {
      await changeAccessPolicy({
        courseId: course.id,
        accessStatus,
        reason,
        expectedRevision: course.revision,
      }).unwrap();
      setAdminActionReason('');
      void message.success(
        accessStatus === 'blocked'
          ? 'Course access blocked for legal/security reasons.'
          : 'Course access restored to available.',
      );
    } catch (err) {
      setActionError(parseApiError(err).message);
    }
  };

  return (
    <div className="space-y-lg max-w-[980px]">
      <Link
        to="/admin/courses"
        className="inline-flex items-center gap-xs text-[13px] font-semibold text-primary hover:text-primary-light"
      >
        <ArrowLeftOutlined />
        <span>Back to Courses</span>
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <div className="flex items-center gap-xs flex-wrap">
            <StatusBadge label="New Course Review" tone="teal" />
            <StatusBadge label={course.status.replace('_', ' ')} />
            <StatusBadge
              label={`Access: ${course.accessStatus}`}
              tone={course.accessStatus === 'blocked' ? 'error' : 'success'}
            />
          </div>
          <h1 className="text-[24px] font-bold text-ink mt-xs mb-0">
            {course.title}
          </h1>
        </div>
        {course.status === 'published' && (
          <Link to={`/admin/courses/${course.id}/revisions`}>
            <DashboardButton variant="outline">View Revisions</DashboardButton>
          </Link>
        )}
      </div>

      {actionError && <Alert type="error" showIcon title={actionError} />}

      {/* Metadata */}
      <Card className="rounded-lg shadow-card border-hairline">
        <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
          <Descriptions.Item label="Instructor">
            {instructor ? `${instructor.name} (${instructor.email})` : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Category">
            {course.category?.name ?? 'Unavailable'}
          </Descriptions.Item>
          <Descriptions.Item label="Price">
            {formatEgpPrice(course.priceMinor)}
          </Descriptions.Item>
          <Descriptions.Item label="Level / Language">
            {course.level ?? '—'} / {course.language ?? '—'}
          </Descriptions.Item>
        </Descriptions>

        <div className="mt-md space-y-xs">
          <p className="text-[14px] font-semibold text-ink m-0">Short Description</p>
          <p className="text-[14px] text-ink-secondary m-0">
            {course.shortDescription || '—'}
          </p>
          <p className="text-[14px] font-semibold text-ink mt-sm mb-0">Description</p>
          <p className="text-[14px] text-ink-secondary whitespace-pre-line m-0">
            {course.description}
          </p>
        </div>
      </Card>

      {/* New Course Publication Review Decision */}
      {course.status === 'pending_review' && (
        <Card className="rounded-lg shadow-card border-hairline space-y-md">
          <h2 className="text-[18px] font-semibold text-ink m-0">
            Publication Review Decision
          </h2>
          <Input.TextArea
            rows={3}
            placeholder="Rejection reason (5–500 chars, required when rejecting)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <Space wrap className="mt-sm">
            <DashboardButton
              variant="primary"
              loading={isReviewing}
              onClick={handleApprove}
            >
              Approve &amp; Publish
            </DashboardButton>
            <DashboardButton
              variant="outline"
              loading={isReviewing}
              onClick={handleReject}
            >
              Reject Submission
            </DashboardButton>
          </Space>
        </Card>
      )}

      {/* Course Administration (Archive & Legal/Security Block) */}
      <Card className="rounded-lg shadow-card border-hairline space-y-md">
        <div>
          <h2 className="text-[18px] font-semibold text-ink m-0">
            Course Administration
          </h2>
          <p className="text-[13px] text-ink-muted m-0">
            Independent administrative controls (10–500 character audit reason required).
          </p>
        </div>
        <Input.TextArea
          rows={2}
          placeholder="Administrative audit reason (10–500 characters)..."
          value={adminActionReason}
          onChange={(e) => setAdminActionReason(e.target.value)}
        />
        <Space wrap className="mt-sm">
          {course.status !== 'archived' && (
            <DashboardButton
              variant="secondary"
              loading={isArchiving}
              onClick={handleArchive}
            >
              Archive Course
            </DashboardButton>
          )}
          {course.accessStatus === 'blocked' ? (
            <DashboardButton
              variant="outline"
              loading={isChangingAccess}
              onClick={() => handleAccessPolicy('available')}
            >
              Restore Access (Unblock)
            </DashboardButton>
          ) : (
            <DashboardButton
              variant="outline"
              loading={isChangingAccess}
              onClick={() => handleAccessPolicy('blocked')}
            >
              Legal / Security Block
            </DashboardButton>
          )}
        </Space>
      </Card>

      {/* Curriculum preview */}
      <div className="space-y-sm">
        <h2 className="text-[18px] font-semibold text-ink m-0">Curriculum</h2>
        {sections.map((section) => (
          <CurriculumSection
            key={section.id}
            title={section.title}
            lessons={section.lessons.map((l) => ({
              id: l.id,
              title: `${l.title} (${l.videoStatus})`,
              durationSeconds: l.durationSeconds,
              isPreview: l.isPreview,
              hasAttachment: l.attachments.length > 0,
              state: l.videoStatus === 'ready' ? 'completed' : 'future',
            }))}
          />
        ))}
      </div>

      {/* Review history */}
      {reviewEvents.length > 0 && (
        <Card className="rounded-lg shadow-card border-hairline">
          <h2 className="text-[18px] font-semibold text-ink mb-sm">
            Review Audit Trail
          </h2>
          <ul className="space-y-xs pl-0 list-none m-0 text-[13px]">
            {reviewEvents.map((ev) => (
              <li
                key={ev.id}
                className="flex flex-wrap justify-between gap-xs py-xxs border-b border-hairline"
              >
                <span>
                  <strong>{ev.action}</strong> ({ev.fromStatus ?? 'none'} → {ev.toStatus})
                  {ev.reason ? ` — ${ev.reason}` : ''}
                </span>
                <span className="text-ink-muted">
                  {new Date(ev.occurredAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
