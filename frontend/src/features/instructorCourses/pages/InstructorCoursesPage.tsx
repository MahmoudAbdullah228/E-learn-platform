import { PlusOutlined } from '@ant-design/icons';
import { Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DashboardButton,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardSkeleton,
  DataTable,
  SegmentedFilter,
  StatusBadge,
} from '@/components/dashboard';
import {
  useListInstructorCoursesQuery,
  type CourseStatus,
  type InstructorCourseDto,
} from '@/features/instructorCourses/instructorCoursesApi';
import { parseApiError } from '@/lib/apiError';
import { formatEgpPrice } from '@/lib/formatters';

export default function InstructorCoursesPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<CourseStatus>('draft');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } =
    useListInstructorCoursesQuery({ status, page, limit: 20 });

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

  const courses = data?.data?.courses ?? [];
  const pagination = data?.data?.pagination;

  const columns: ColumnsType<InstructorCourseDto> = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record) => (
        <div>
          <p className="font-semibold text-ink m-0">{title}</p>
          <p className="text-[12px] text-ink-muted m-0">/{record.slug}</p>
        </div>
      ),
    },
    {
      title: 'Category',
      key: 'category',
      render: (_v, record) => record.category?.name ?? 'Unavailable category',
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
      title: 'Actions',
      key: 'actions',
      render: (_v, record) => (
        <Space size="middle">
          <Link
            to={`/instructor/courses/${record.id}/edit`}
            className="text-[14px] font-semibold text-primary hover:text-primary-light"
          >
            {record.status === 'draft' ? 'Edit Details' : 'View / Manage'}
          </Link>
          <Link
            to={`/instructor/courses/${record.id}/curriculum`}
            className="text-[14px] font-semibold text-ink-nav hover:text-primary"
          >
            Curriculum
          </Link>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-xl">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
            Course Authoring
          </span>
          <h1 className="text-[24px] font-bold text-ink mt-xxs">My Courses</h1>
        </div>
        <DashboardButton
          variant="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate('/instructor/courses/new')}
        >
          New Draft Course
        </DashboardButton>
      </div>

      <div className="overflow-x-auto pb-xxs">
        <SegmentedFilter<CourseStatus>
          value={status}
          onChange={(val) => {
            setStatus(val);
            setPage(1);
          }}
          options={[
            { label: 'Drafts', value: 'draft' },
            { label: 'Pending Review', value: 'pending_review' },
            { label: 'Published', value: 'published' },
            { label: 'Rejected', value: 'rejected' },
            { label: 'Unavailable', value: 'unavailable' },
            { label: 'Archived', value: 'archived' },
          ]}
        />
      </div>

      {courses.length === 0 ? (
        <DashboardEmptyState
          title={`No ${status.replace('_', ' ')} courses`}
          description={
            status === 'draft'
              ? 'Create your first draft course to start building your curriculum.'
              : 'Courses with this status will appear here.'
          }
          actionLabel={status === 'draft' ? 'Create Draft Course' : undefined}
          onAction={
            status === 'draft' ? () => navigate('/instructor/courses/new') : undefined
          }
        />
      ) : (
        <DataTable<InstructorCourseDto>
          rowKey="id"
          columns={columns}
          dataSource={courses}
          pagination={
            pagination
              ? {
                  current: pagination.page,
                  pageSize: pagination.limit,
                  total: pagination.total,
                  onChange: (nextPage) => setPage(nextPage),
                }
              : false
          }
        />
      )}
    </div>
  );
}
