import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertCircle, CheckCircle2, Info, Inbox, X } from 'lucide-react';
import {
  useCallback,
  useState,
  type ReactNode,
} from 'react';
import { PublicButton } from '@/components/public/Button';
import { PublicToastContext, type ToastTone } from '@/components/public/publicToastContext';
import { cn } from '@/lib/cn';

/* ─── Empty State Card (ex-empty-state-card) ─────────────────────────────── */
interface EmptyStateCardProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
  className?: string;
}

export function PublicEmptyStateCard({
  title,
  description,
  actionLabel,
  onAction,
  icon,
  className,
}: EmptyStateCardProps) {
  return (
    <div
      className={cn(
        'bg-surface rounded-lg p-section text-center border border-hairline flex flex-col items-center gap-sm',
        className,
      )}
    >
      <div className="h-12 w-12 rounded-full bg-primary-tint text-primary flex items-center justify-center">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <h3 className="text-[18px] font-semibold text-ink">{title}</h3>
      {description && (
        <p className="text-[14px] text-ink-secondary max-w-[420px]">{description}</p>
      )}
      {actionLabel && onAction && (
        <div className="pt-xs">
          <PublicButton variant="primary" onClick={onAction}>
            {actionLabel}
          </PublicButton>
        </div>
      )}
    </div>
  );
}

/* ─── Error State Card ───────────────────────────────────────────────────── */
interface ErrorStateCardProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function PublicErrorStateCard({
  title = 'Unable to load content',
  message,
  onRetry,
  retryLabel = 'Try Again',
  className,
}: ErrorStateCardProps) {
  return (
    <div
      role="alert"
      className={cn(
        'bg-surface rounded-lg p-xxl text-center border border-error/25 flex flex-col items-center gap-sm',
        className,
      )}
    >
      <div className="h-12 w-12 rounded-full bg-error-bg text-error flex items-center justify-center">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h3 className="text-[18px] font-semibold text-ink">{title}</h3>
      <p className="text-[14px] text-ink-secondary max-w-[440px]">{message}</p>
      {onRetry && (
        <div className="pt-xs">
          <PublicButton variant="outline" onClick={onRetry}>
            {retryLabel}
          </PublicButton>
        </div>
      )}
    </div>
  );
}

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
interface PublicSkeletonProps {
  className?: string;
}

export function PublicSkeleton({ className }: PublicSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse bg-track rounded-md', className)}
    />
  );
}

/* ─── Modal (ex-modal-card) ──────────────────────────────────────────────── */
interface PublicModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  maxWidthClass?: string;
}

export function PublicModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  maxWidthClass = 'max-w-[560px]',
}: PublicModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-[1px]" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 bg-surface rounded-xxl p-xxl shadow-raised border border-hairline focus:outline-none',
            maxWidthClass,
          )}
        >
          <div className="flex items-start justify-between gap-md mb-md">
            <div>
              <DialogPrimitive.Title className="text-[20px] font-bold text-ink">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-[14px] text-ink-secondary mt-xxs">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Close modal"
              className="text-ink-muted hover:text-ink p-xxs rounded-sm cursor-pointer"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ─── Toast (ex-toast) ───────────────────────────────────────────────────── */
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

export function PublicToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4000);
  }, []);

  const dismiss = (id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <PublicToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-xl right-xl z-50 flex flex-col gap-xs max-w-[380px] w-[calc(100%-32px)] pointer-events-none"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto bg-surface rounded-lg px-md py-sm shadow-raised border border-hairline flex items-center gap-sm text-[14px] text-ink"
          >
            {toast.tone === 'success' && (
              <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            )}
            {toast.tone === 'error' && (
              <AlertCircle className="h-4 w-4 text-error shrink-0" />
            )}
            {toast.tone === 'info' && (
              <Info className="h-4 w-4 text-primary shrink-0" />
            )}
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="text-ink-muted hover:text-ink cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </PublicToastContext.Provider>
  );
}

