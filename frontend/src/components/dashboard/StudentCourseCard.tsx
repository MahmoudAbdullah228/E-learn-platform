import { BookOutlined, CheckCircleFilled } from '@ant-design/icons';
import { Card } from 'antd';
import { DashboardButton } from '@/components/dashboard/DashboardButton';
import { ProgressBar } from '@/components/dashboard/ProgressBar';
import { cn } from '@/lib/cn';

interface StudentCourseCardProps {
  title: string;
  instructorName: string;
  coverUrl?: string | null;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  onAction: () => void;
  unavailable?: boolean;
  className?: string;
}

export function StudentCourseCard({
  title,
  instructorName,
  coverUrl,
  progressPercent,
  completedLessons,
  totalLessons,
  onAction,
  unavailable = false,
  className,
}: StudentCourseCardProps) {
  const isCompleted = progressPercent >= 100 && !unavailable;

  return (
    <Card
      className={cn('rounded-lg shadow-card border-hairline overflow-hidden h-full flex flex-col', className)}
      styles={{ body: { padding: 12, display: 'flex', flexDirection: 'column', flex: 1 } }}
    >
      <div className="aspect-video rounded-md overflow-hidden bg-primary-tint flex items-center justify-center mb-sm">
        {coverUrl ? (
          <img src={coverUrl} alt={title} className="h-full w-full object-cover" />
        ) : (
          <BookOutlined className="text-[24px] text-primary" />
        )}
      </div>

      <div className="flex-1 flex flex-col justify-between gap-sm">
        <div className="space-y-xxs">
          <h3 className="text-[16px] font-semibold leading-[1.4] text-ink line-clamp-2">
            {title}
          </h3>
          <p className="text-[12px] text-ink-muted">By {instructorName}</p>
        </div>

        {unavailable ? (
          <div className="space-y-sm">
            <p className="text-[12px] font-medium text-ink-muted">
              Course currently unavailable
            </p>
            <DashboardButton variant="secondary" fullWidth disabled>
              Unavailable
            </DashboardButton>
          </div>
        ) : isCompleted ? (
          <div className="space-y-sm">
            <div className="flex items-center gap-xxs text-[12px] font-semibold text-success-strong">
              <CheckCircleFilled />
              <span>Completed</span>
            </div>
            <ProgressBar
              percent={100}
              completedCount={completedLessons}
              totalCount={totalLessons}
              showMeta={false}
            />
            <DashboardButton variant="outline" fullWidth onClick={onAction}>
              Review Course
            </DashboardButton>
          </div>
        ) : (
          <div className="space-y-sm">
            <ProgressBar
              percent={progressPercent}
              completedCount={completedLessons}
              totalCount={totalLessons}
            />
            <DashboardButton variant="primary" fullWidth onClick={onAction}>
              Continue Learning
            </DashboardButton>
          </div>
        )}
      </div>
    </Card>
  );
}
