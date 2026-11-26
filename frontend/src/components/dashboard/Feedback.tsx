import {
  ExclamationCircleOutlined,
  InboxOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { App as _AntdApp, Card, Modal, Progress, Skeleton, type ModalProps } from 'antd';
import type { ReactNode } from 'react';
import { DashboardButton } from '@/components/dashboard/DashboardButton';
import { cn } from '@/lib/cn';

/* ─── Empty State Card ───────────────────────────────────────────────────── */
interface DashboardEmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
  className?: string;
}

export function DashboardEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
  className,
}: DashboardEmptyStateProps) {
  return (
    <Card
      className={cn('rounded-lg border-hairline shadow-card text-center', className)}
      styles={{ body: { padding: 48 } }}
    >
      <div className="flex flex-col items-center gap-sm">
        <div className="h-12 w-12 rounded-full bg-primary-tint text-primary flex items-center justify-center text-[22px]">
          {icon ?? <InboxOutlined />}
        </div>
        <h3 className="text-[18px] font-semibold text-ink m-0">{title}</h3>
        {description && (
          <p className="text-[14px] text-ink-secondary max-w-[420px] m-0">{description}</p>
        )}
        {actionLabel && onAction && (
          <div className="pt-xs">
            <DashboardButton variant="primary" onClick={onAction}>
              {actionLabel}
            </DashboardButton>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ─── Error State Card ───────────────────────────────────────────────────── */
interface DashboardErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function DashboardErrorState({
  title = 'Unable to load data',
  message,
  onRetry,
  retryLabel = 'Try Again',
  className,
}: DashboardErrorStateProps) {
  return (
    <Card
      role="alert"
      className={cn('rounded-lg border-error/25 shadow-card text-center', className)}
      styles={{ body: { padding: 32 } }}
    >
      <div className="flex flex-col items-center gap-sm">
        <div className="h-12 w-12 rounded-full bg-error-bg text-error flex items-center justify-center text-[22px]">
          <ExclamationCircleOutlined />
        </div>
        <h3 className="text-[18px] font-semibold text-ink m-0">{title}</h3>
        <p className="text-[14px] text-ink-secondary max-w-[440px] m-0">{message}</p>
        {onRetry && (
          <div className="pt-xs">
            <DashboardButton variant="outline" onClick={onRetry}>
              {retryLabel}
            </DashboardButton>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
export function DashboardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card className="rounded-lg shadow-card border-hairline">
      <Skeleton active paragraph={{ rows }} />
    </Card>
  );
}

/* ─── Modal ──────────────────────────────────────────────────────────────── */
export function DashboardModal({ children, ...props }: ModalProps) {
  return (
    <Modal centered destroyOnHidden footer={null} {...props}>
      {children}
    </Modal>
  );
}

/* ─── Upload Progress UI ─────────────────────────────────────────────────── */
interface UploadProgressCardProps {
  fileName: string;
  percent: number;
  statusLabel: string;
  isError?: boolean;
  isComplete?: boolean;
  onRetry?: () => void;
}

export function UploadProgressCard({
  fileName,
  percent,
  statusLabel,
  isError = false,
  isComplete = false,
  onRetry,
}: UploadProgressCardProps) {
  return (
    <Card
      className="rounded-lg border-border shadow-card"
      styles={{ body: { padding: 14 } }}
    >
      <div className="flex items-center justify-between gap-sm mb-xs">
        <div className="flex items-center gap-xs min-w-0">
          <UploadOutlined className="text-primary shrink-0" />
          <span className="text-[14px] font-medium text-ink truncate">{fileName}</span>
        </div>
        <span
          className={cn(
            'text-[12px] font-medium shrink-0',
            isError
              ? 'text-error'
              : isComplete
                ? 'text-success-strong'
                : 'text-primary',
          )}
        >
          {statusLabel}
        </span>
      </div>
      <Progress
        percent={Math.max(0, Math.min(100, Math.round(percent)))}
        showInfo={false}
        size={{ height: 6 }}
        strokeColor={isError ? '#ef4444' : isComplete ? '#22c55e' : '#088395'}
        railColor="#f3f4f6"
      />
      {isError && onRetry && (
        <div className="mt-xs flex justify-end">
          <DashboardButton variant="outline" size="small" onClick={onRetry}>
            Retry Upload
          </DashboardButton>
        </div>
      )}
    </Card>
  );
}

