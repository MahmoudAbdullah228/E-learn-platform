import { Card, Statistic } from 'antd';
import type { ReactNode } from 'react';
import { ProgressBar } from '@/components/dashboard/ProgressBar';
import { cn } from '@/lib/cn';

type MetricIconTone = 'teal' | 'green' | 'blue' | 'rose';

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  iconTone?: MetricIconTone;
  progressPercent?: number;
  className?: string;
}

const toneClasses: Record<MetricIconTone, string> = {
  teal: 'bg-primary-tint text-primary',
  green: 'bg-tint-green text-success-strong',
  blue: 'bg-tint-blue text-primary',
  rose: 'bg-tint-rose text-error',
};

export function MetricCard({
  label,
  value,
  icon,
  iconTone = 'teal',
  progressPercent,
  className,
}: MetricCardProps) {
  if (progressPercent !== undefined) {
    return (
      <Card
        className={cn('rounded-lg shadow-card border-hairline', className)}
        styles={{ body: { padding: 16 } }}
      >
        <div className="space-y-xs">
          <div className="flex items-center justify-between gap-xs">
            <span className="text-[12px] text-ink-muted">{label}</span>
            <span className="text-[18px] font-bold text-ink">{value}</span>
          </div>
          <ProgressBar percent={progressPercent} showMeta={false} />
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={cn('rounded-lg shadow-card border-hairline', className)}
      styles={{ body: { padding: 16 } }}
    >
      <div className="flex items-center gap-md">
        {icon && (
          <div
            className={cn(
              'h-11 w-11 rounded-full flex items-center justify-center text-[18px] shrink-0',
              toneClasses[iconTone],
            )}
          >
            {icon}
          </div>
        )}
        <Statistic
          title={<span className="text-[12px] text-ink-muted">{label}</span>}
          value={value}
          styles={{
            content: {
              fontSize: 24,
              fontWeight: 700,
              lineHeight: 1.2,
              color: '#071952',
            },
          }}
        />
      </div>
    </Card>
  );
}
