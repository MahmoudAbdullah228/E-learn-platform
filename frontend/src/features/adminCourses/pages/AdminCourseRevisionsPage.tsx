import { ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, Card, Input, Space } from 'antd';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  DashboardButton,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardSkeleton,
  StatusBadge,
  useDashboardNotify,
} from '@/components/dashboard';
import {
  useApproveAdminCourseRevisionMutation,
  useGetAdminCourseRevisionDetailQuery,
  useListAdminCourseRevisionsQuery,
  useRejectAdminCourseRevisionMutation,
} from '@/features/adminCourses/adminCoursesApi';
import { parseApiError } from '@/lib/apiError';

export default function AdminCourseRevisionsPage() {
  const { courseId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { message } = useDashboardNotify();

  const selectedRevisionId = searchParams.get('revisionId') ?? '';
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: listRes,
    isLoading: isListLoading,
    isError: isListError,
    error: listError,
    refetch: refetchList,
  } = useListAdminCourseRevisionsQuery();

  const items = (listRes?.data?.items ?? []).filter((item) =>
    courseId ? item.courseId === courseId : true,
  );
  const activeRevisionId = selectedRevisionId || items[0]?.id || '';

  const {
    data: detailRes,
    isLoading: isDetailLoading,
    isError: isDetailError,
    error: detailError,
    refetch: refetchDetail,
  } = useGetAdminCourseRevisionDetailQuery(activeRevisionId, {
    skip: !activeRevisionId,
  });

  const [approveRevision, { isLoading: isApproving }] =
    useApproveAdminCourseRevisionMutation();
  const [rejectRevision, { isLoading: isRejecting }] =
    useRejectAdminCourseRevisionMutation();

  if (isListLoading) {
    return <DashboardSkeleton rows={6} />;
  }

  if (isListError) {
    return (
      <DashboardErrorState
        message={parseApiError(listError).message}
        onRetry={() => refetchList()}
      />
    );
  }

  const detail = detailRes?.data;

  const handleApprove = async () => {
    if (!detail) return;
    setActionError(null);
    try {
      await approveRevision({
        revisionId: detail.id,
        expectedRevision: detail.revision,
        baseContentRevision: detail.baseContentRevision,
      }).unwrap();
      void message.success('Published-course revision approved and applied live.');
      setSearchParams({});
      void refetchList();
    } catch (err) {
      setActionError(parseApiError(err).message);
    }
  };

  const handleReject = async () => {
    if (!detail) return;
    setActionError(null);
    const trimmed = rejectReason.trim();
    if (trimmed.length < 10 || trimmed.length > 500) {
      setActionError('Rejection reason must be 10 to 500 characters.');
      return;
    }
    try {
      await rejectRevision({
        revisionId: detail.id,
        expectedRevision: detail.revision,
        baseContentRevision: detail.baseContentRevision,
        reason: trimmed,
      }).unwrap();
      setRejectReason('');
      void message.success('Revision rejected. Live course remains untouched.');
      setSearchParams({});
      void refetchList();
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
        <span>Back to Courses &amp; Revisions</span>
      </Link>

      <div>
        <div className="flex items-center gap-xs flex-wrap">
          <StatusBadge label="Revision of Published Course" tone="teal" />
        </div>
        <h1 className="text-[24px] font-bold text-ink mt-xs mb-0">
          Published-Course Revision Review
        </h1>
        <p className="text-[14px] text-ink-secondary mt-xxs">
          Reviewing an update to an already-published course. The current published version remains live to students until you approve.
        </p>
      </div>

      {items.length === 0 ? (
        <DashboardEmptyState
          title="No pending revisions"
          description={
            courseId
              ? 'This published course has no pending revision awaiting review.'
              : 'There are currently no pending revisions across published courses.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg items-start">
          {/* Revision queue list */}
          <Card className="rounded-lg shadow-card border-hairline" styles={{ body: { padding: 12 } }}>
            <div className="space-y-xs">
              {items.map((item) => {
                const isSelected = item.id === activeRevisionId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSearchParams({ revisionId: item.id })}
                    className={`w-full text-left rounded-md p-sm border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-primary-wash border-primary text-primary'
                        : 'bg-surface border-border text-ink hover:border-primary'
                    }`}
                  >
                    <p className="font-semibold text-[14px] m-0">
                      Revision #{item.number}
                    </p>
                    <p className="text-[12px] text-ink-muted m-0 truncate">
                      {typeof item.metadata.title === 'string'
                        ? item.metadata.title
                        : item.courseId}
                    </p>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Revision Diff & Decision */}
          <div className="lg:col-span-2 space-y-md">
            {isDetailLoading ? (
              <DashboardSkeleton rows={6} />
            ) : isDetailError || !detail ? (
              <DashboardErrorState
                message={parseApiError(detailError, 'Revision not found.').message}
                onRetry={() => refetchDetail()}
              />
            ) : (
              <>
                {actionError && <Alert type="error" showIcon title={actionError} />}

                <Card className="rounded-lg shadow-card border-hairline space-y-md">
                  <div className="flex flex-wrap items-center justify-between gap-sm">
                    <div>
                      <h2 className="text-[18px] font-semibold text-ink m-0">
                        Revision #{detail.number} Changes ({detail.changes.length})
                      </h2>
                      <p className="text-[12px] text-ink-muted m-0">
                        Base content rev {detail.baseContentRevision} • Live rev{' '}
                        {detail.currentContentRevision}
                      </p>
                    </div>
                    <StatusBadge label={detail.status.replace('_', ' ')} />
                  </div>

                  <div className="space-y-sm">
                    {detail.changes.map((change, idx) => (
                      <div
                        key={`${change.kind}-${change.id}-${idx}`}
                        className="rounded-md border border-border bg-surface-subtle p-sm space-y-xs text-[13px]"
                      >
                        <div className="flex items-center justify-between gap-xs">
                          <span className="font-semibold text-ink uppercase text-[11px]">
                            {change.kind} ({change.id.slice(-6)})
                          </span>
                          {change.videoChanged && (
                            <StatusBadge label="Video Changed" tone="teal" />
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
                          <div className="bg-surface p-xs rounded-sm border border-hairline">
                            <p className="text-[11px] font-bold text-ink-muted uppercase m-0 mb-xxs">
                              Before
                            </p>
                            <pre className="text-[11px] whitespace-pre-wrap break-all m-0 text-ink-secondary">
                              {change.before ? JSON.stringify(change.before, null, 2) : 'None (New)'}
                            </pre>
                          </div>
                          <div className="bg-surface p-xs rounded-sm border border-hairline">
                            <p className="text-[11px] font-bold text-primary uppercase m-0 mb-xxs">
                              After
                            </p>
                            <pre className="text-[11px] whitespace-pre-wrap break-all m-0 text-ink">
                              {change.after ? JSON.stringify(change.after, null, 2) : 'Removed'}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                {detail.status === 'pending_review' && (
                  <Card className="rounded-lg shadow-card border-hairline space-y-md">
                    <h3 className="text-[16px] font-semibold text-ink m-0">
                      Revision Decision
                    </h3>
                    <Input.TextArea
                      rows={3}
                      placeholder="Rejection reason (10–500 chars, required only when rejecting)"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <Space wrap className="mt-sm">
                      <DashboardButton
                        variant="primary"
                        loading={isApproving}
                        onClick={handleApprove}
                      >
                        Approve &amp; Publish Revision
                      </DashboardButton>
                      <DashboardButton
                        variant="outline"
                        loading={isRejecting}
                        onClick={handleReject}
                      >
                        Reject Revision
                      </DashboardButton>
                    </Space>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
