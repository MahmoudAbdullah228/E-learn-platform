import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DashboardEmptyState,
  DashboardErrorState,
  DashboardSkeleton,
  DataTable,
  SegmentedFilter,
  StatusBadge,
} from '@/components/dashboard';
import {
  useListAdminCourseRevisionsQuery,
  useListAdminCoursesQuery,
  type AdminCourseRevisionSummaryDto,
} from '@/features/adminCourses/adminCoursesApi';
import type { CourseStatus, InstructorCourseDto } from '@/features/instructorCourses/instructorCoursesApi';
import { parseApiError } from '@/lib/apiError';
import { formatEgpPrice } from '@/lib/formatters';

type ModerationMode = 'new_courses' | 'revisions';

export default function AdminCoursesPage() {
  const [mode, setMode] = useState<ModerationMode>('new_courses');
  const [courseStatus, setCourseStatus] = useState<CourseStatus>('pending_review');
  const [page, setPage] = useState(1);

  const {
    data: coursesRes,
    isLoading: isCoursesLoading,
    isError: isCoursesError,
    error: coursesError,
    refetch: refetchCourses,
  } = useListAdminCoursesQuery(
    { status: courseStatus, page, limit: 20 },
    { skip: mode !== 'new_courses' },
  );

  const {
    data: revisionsRes,
    isLoading: isRevisionsLoading,
    isError: isRevisionsError,
    error: revisionsError,
    refetch: refetchRevisions,
  } = useListAdminCourseRevisionsQuery(undefined, {
    skip: mode !== 'revisions',
  });

  const courseColumns: ColumnsType<InstructorCourseDto> = [
    {
      title: 'New Course Draft',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record) => (
        <div>
          <div className="flex items-center gap-xs flex-wrap">
            <span className="font-semibold text-ink">{title}</span>
            <StatusBadge label="New Course" tone="teal" />
          </div>
          <p className="text-[12px] text-ink-muted m-0">/{record.slug}</p>
        </div>
      ),
    },
    {
      title: 'Category',
      key: 'category',
      render: (_v, record) => record.category?.name ?? 'Unavailable',
    },
    {
      title: 'Price',
      dataIndex: 'priceMinor',
      key: 'priceMinor',
      render: (priceMinor: number) => (
        <span className="font-bold text-ink">{formatEgpPrice(priceMinor)}</span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => <StatusBadge label={val.replace('_', ' ')} />,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_v, record) => (
        <Link
          to={`/admin/courses/${record.id}`}
          className="text-[14px] font-semibold text-primary hover:text-primary-light"
        >
          Inspect &amp; Moderate
        </Link>
      ),
    },
  ];

  const revisionColumns: ColumnsType<AdminCourseRevisionSummaryDto> = [
    {
      title: 'Published Course Revision',
      key: 'title',
      render: (_v, record) => (
        <div>
          <div className="flex items-center gap-xs flex-wrap">
            <span className="font-semibold text-ink">
              {typeof record.metadata.title === 'string'
                ? record.metadata.title
                : `Course ${record.courseId.slice(-6)}`}
            </span>
            <StatusBadge label={`Revision #${record.number} of Published`} tone="teal" />
          </div>
          <p className="text-[12px] text-ink-muted m-0">
            Course ID: {record.courseId}
          </p>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => <StatusBadge label={val.replace('_', ' ')} />,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_v, record) => (
        <Link
          to={`/admin/courses/${record.courseId}/revisions?revisionId=${encodeURIComponent(record.id)}`}
          className="text-[14px] font-semibold text-primary hover:text-primary-light"
        >
          Review Revision Diff
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-md">
        <div>
          <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
            Content Moderation
          </span>
          <h1 className="text-[24px] font-bold text-ink mt-xxs">
            Courses &amp; Revisions
          </h1>
        </div>

        <SegmentedFilter<ModerationMode>
          value={mode}
          onChange={setMode}
          options={[
            { label: 'New Course Submissions', value: 'new_courses' },
            { label: 'Published Course Revisions', value: 'revisions' },
          ]}
        />
      </div>

      {mode === 'new_courses' ? (
        <div className="space-y-md">
          <div className="overflow-x-auto pb-xxs">
            <SegmentedFilter<CourseStatus>
              value={courseStatus}
              onChange={(val) => {
                setCourseStatus(val);
                setPage(1);
              }}
              options={[
                { label: 'Pending Review', value: 'pending_review' },
                { label: 'Published', value: 'published' },
                { label: 'Rejected', value: 'rejected' },
                { label: 'Unavailable', value: 'unavailable' },
                { label: 'Archived', value: 'archived' },
              ]}
            />
          </div>

          {isCoursesLoading ? (
            <DashboardSkeleton rows={6} />
          ) : isCoursesError ? (
            <DashboardErrorState
              message={parseApiError(coursesError).message}
              onRetry={() => refetchCourses()}
            />
          ) : (coursesRes?.data?.courses ?? []).length === 0 ? (
            <DashboardEmptyState
              title={`No ${courseStatus.replace('_', ' ')} courses`}
              description="New course drafts in this state will appear here."
            />
          ) : (
            <DataTable<InstructorCourseDto>
              rowKey="id"
              columns={courseColumns}
              dataSource={coursesRes?.data?.courses ?? []}
              pagination={
                coursesRes?.data?.pagination
                  ? {
                      current: coursesRes.data.pagination.page,
                      pageSize: coursesRes.data.pagination.limit,
                      total: coursesRes.data.pagination.total,
                      onChange: (nextPage) => setPage(nextPage),
                    }
                  : false
              }
            />
          )}
        </div>
      ) : isRevisionsLoading ? (
        <DashboardSkeleton rows={5} />
      ) : isRevisionsError ? (
        <DashboardErrorState
          message={parseApiError(revisionsError).message}
          onRetry={() => refetchRevisions()}
        />
      ) : (revisionsRes?.data?.items ?? []).length === 0 ? (
        <DashboardEmptyState
          title="No pending published-course revisions"
          description="Major edits submitted for already-published courses appear here separately from new courses."
        />
      ) : (
        <DataTable<AdminCourseRevisionSummaryDto>
          rowKey="id"
          columns={revisionColumns}
          dataSource={revisionsRes?.data?.items ?? []}
          pagination={false}
        />
      )}
    </div>
  );
}
