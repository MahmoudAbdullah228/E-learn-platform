import { Tag } from 'antd';
import { inferStatusTone, type StatusTone } from '@/components/dashboard/statusTone';
import { cn } from '@/lib/cn';

interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
  className?: string;
}

const toneStyles: Record<StatusTone, { container: string; dot: string }> = {
  success: {
    container: 'bg-success-bg text-success-ink border-success-border',
    dot: 'bg-success-strong',
  },
  teal: {
    container: 'bg-primary-tint text-primary border-primary-soft',
    dot: 'bg-primary',
  },
  error: {
    container: 'bg-error-bg text-error border-error/30',
    dot: 'bg-error',
  },
  muted: {
    container: 'bg-surface-muted text-ink-muted border-border',
    dot: 'bg-ink-muted',
  },
};

export function StatusBadge({ label, tone, className }: StatusBadgeProps) {
  const resolvedTone = tone ?? inferStatusTone(label);
  const style = toneStyles[resolvedTone];

  return (
    <Tag
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-xs py-xxs text-[11px] font-medium leading-[1.2] m-0 border',
        style.container,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', style.dot)} aria-hidden="true" />
      <span>{label}</span>
    </Tag>
  );
}
