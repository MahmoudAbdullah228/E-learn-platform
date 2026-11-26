import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardThemeProvider } from '@/layouts/DashboardThemeProvider';
import {
  CurriculumSection,
  DashboardButton,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardInput,
  DataTable,
  LearningCourseRow,
  MetricCard,
  ProgressBar,
  SegmentedFilter,
  StatusBadge,
  StudentCourseCard,
  UploadProgressCard,
} from '@/components/dashboard';

function renderDashboard(ui: React.ReactElement) {
  return render(<DashboardThemeProvider>{ui}</DashboardThemeProvider>);
}

describe('Dashboard UI Kit (Ant Design themed)', () => {
  it('renders buttons, inputs, metric card, and progress bar', () => {
    renderDashboard(
      <div>
        <DashboardButton variant="primary">Save Draft</DashboardButton>
        <DashboardInput label="Course Title" error="Title is required" />
        <MetricCard label="Enrolled Courses" value={4} />
        <ProgressBar percent={65} completedCount={13} totalCount={20} />
      </div>,
    );

    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Title is required');
    expect(screen.getByText('Enrolled Courses')).toBeInTheDocument();
    expect(screen.getByText('65% complete')).toBeInTheDocument();
    expect(screen.getByText('13 of 20 lessons')).toBeInTheDocument();
  });

  it('renders learning row and student course cards for in-progress vs completed', () => {
    const onContinue = vi.fn();
    const onReview = vi.fn();
    renderDashboard(
      <div>
        <LearningCourseRow
          title="TypeScript Mastery"
          instructorName="Nour"
          progressPercent={40}
          completedLessons={4}
          totalLessons={10}
          onContinue={onContinue}
        />
        <StudentCourseCard
          title="Completed Course"
          instructorName="Nour"
          progressPercent={100}
          completedLessons={5}
          totalLessons={5}
          onAction={onReview}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue Learning' }));
    expect(onContinue).toHaveBeenCalledTimes(1);

    expect(screen.getByText('Completed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review Course' }));
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it('renders curriculum section lesson states, status badge, segmented filter, data table, and feedback', () => {
    const onSelectLesson = vi.fn();
    const onSegmentChange = vi.fn();
    renderDashboard(
      <div>
        <CurriculumSection
          title="Module 1"
          onSelectLesson={onSelectLesson}
          lessons={[
            { id: '1', title: 'Done Lesson', state: 'completed', durationSeconds: 120 },
            { id: '2', title: 'Active Lesson', state: 'current', durationSeconds: 180 },
            { id: '3', title: 'Next Lesson', state: 'future', durationSeconds: 240 },
          ]}
        />
        <StatusBadge label="Paid" />
        <SegmentedFilter
          value="all"
          onChange={onSegmentChange}
          options={[
            { label: 'All Courses', value: 'all' },
            { label: 'In Progress', value: 'in_progress' },
          ]}
        />
        <DataTable
          rowKey="id"
          columns={[{ title: 'Order ID', dataIndex: 'id', key: 'id' }]}
          dataSource={[{ id: 'ORD-1001' }]}
        />
        <UploadProgressCard fileName="lesson1.mp4" percent={75} statusLabel="Uploading" />
        <DashboardEmptyState title="Nothing here yet" />
        <DashboardErrorState message="Server error" />
      </div>,
    );

    fireEvent.click(screen.getByText('Active Lesson'));
    expect(onSelectLesson).toHaveBeenCalledWith(
      expect.objectContaining({ id: '2', state: 'current' }),
    );
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('ORD-1001')).toBeInTheDocument();
    expect(screen.getByText('lesson1.mp4')).toBeInTheDocument();
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    expect(screen.getByText('Server error')).toBeInTheDocument();
  });
});
