import { BookOutlined } from '@ant-design/icons';
import { Card } from 'antd';
import { DashboardButton } from '@/components/dashboard/DashboardButton';
import { ProgressBar } from '@/components/dashboard/ProgressBar';
import { cn } from '@/lib/cn';

interface LearningCourseRowProps {
  title: string;
  instructorName: string;
  coverUrl?: string | null;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  onContinue: () => void;
  ctaLabel?: string;
  className?: string;
}

export function LearningCourseRow({
  title,
  instructorName,
  coverUrl,
  progressPercent,
  completedLessons,
  totalLessons,
  onContinue,
  ctaLabel = 'Continue Learning',
  className,
}: LearningCourseRowProps) {
  return (
    <Card
      className={cn('rounded-lg shadow-card border-hairline', className)}
      styles={{ body: { padding: 16 } }}
    >
      <div className="flex flex-col md:flex-row md:items-center gap-md">
        <div className="w-full md:w-36 aspect-video rounded-md overflow-hidden bg-primary-tint flex items-center justify-center shrink-0">
          {coverUrl ? (
            <img src={coverUrl} alt={title} className="h-full w-full object-cover" />
          ) : (
            <BookOutlined className="text-[22px] text-primary" />
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-xs">
          <div>
            <h3 className="text-[16px] font-semibold leading-[1.4] text-ink truncate">
              {title}
            </h3>
            <p className="text-[12px] text-ink-muted">By {instructorName}</p>
          </div>
          <ProgressBar
            percent={progressPercent}
            completedCount={completedLessons}
            totalCount={totalLessons}
          />
        </div>

        <div className="shrink-0">
          <DashboardButton variant="primary" onClick={onContinue}>
            {ctaLabel}
          </DashboardButton>
        </div>
      </div>
    </Card>
  );
}
