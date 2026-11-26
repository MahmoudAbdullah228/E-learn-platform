import { Progress } from 'antd';
import { cn } from '@/lib/cn';

interface ProgressBarProps {
  percent: number;
  completedCount?: number;
  totalCount?: number;
  showMeta?: boolean;
  className?: string;
}

export function ProgressBar({
  percent,
  completedCount,
  totalCount,
  showMeta = true,
  className,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const isComplete = clamped >= 100;

  return (
    <div className={cn('w-full space-y-xxs', className)}>
      {showMeta && (
        <div className="flex items-center justify-between gap-xs text-[12px] leading-[1.4]">
          <span className={cn(isComplete ? 'text-success-strong font-medium' : 'text-ink-muted')}>
            {clamped}% complete
          </span>
          {completedCount !== undefined && totalCount !== undefined && (
            <span className="text-ink-muted">
              {completedCount} of {totalCount} lessons
            </span>
          )}
        </div>
      )}
      <Progress
        percent={clamped}
        showInfo={false}
        size={{ height: 6 }}
        strokeColor={isComplete ? '#22c55e' : '#088395'}
        railColor="#f3f4f6"
      />
    </div>
  );
}
