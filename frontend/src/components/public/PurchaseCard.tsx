import { Play } from 'lucide-react';
import type { ReactNode } from 'react';
import { PublicButton } from '@/components/public/Button';
import { cn } from '@/lib/cn';
import { formatEgpPrice } from '@/lib/formatters';

interface PurchaseCardProps {
  priceMinor: number;
  coverUrl?: string | null;
  courseTitle: string;
  ctaLabel: string;
  onCtaClick: () => void;
  ctaLoading?: boolean;
  ctaDisabled?: boolean;
  onPreviewClick?: () => void;
  hasPreview?: boolean;
  termsText?: string;
  footerExtra?: ReactNode;
  className?: string;
}

export function PurchaseCard({
  priceMinor,
  coverUrl,
  courseTitle,
  ctaLabel,
  onCtaClick,
  ctaLoading = false,
  ctaDisabled = false,
  onPreviewClick,
  hasPreview = false,
  termsText = 'Full lifetime access on desktop and mobile.',
  footerExtra,
  className,
}: PurchaseCardProps) {
  return (
    <aside
      className={cn(
        'bg-surface rounded-xxl p-xxl shadow-raised border border-hairline space-y-lg',
        className,
      )}
    >
      <div className="relative aspect-video rounded-lg overflow-hidden bg-video-black flex items-center justify-center">
        {coverUrl && (
          <img
            src={coverUrl}
            alt={courseTitle}
            className="h-full w-full object-cover opacity-85"
          />
        )}
        {hasPreview && onPreviewClick ? (
          <button
            type="button"
            onClick={onPreviewClick}
            aria-label="Play preview lesson"
            className="absolute inset-0 flex flex-col items-center justify-center gap-xs bg-black/25 hover:bg-black/35 transition-colors cursor-pointer"
          >
            <span className="h-14 w-14 rounded-full bg-primary-tint text-primary flex items-center justify-center shadow-raised">
              <Play className="h-6 w-6 fill-current ml-0.5" />
            </span>
            <span className="text-[12px] font-semibold text-on-primary">
              Preview this course
            </span>
          </button>
        ) : (
          !coverUrl && (
            <span className="text-[13px] text-on-primary/70">Course Preview</span>
          )
        )}
      </div>

      <div className="space-y-md">
        <div className="text-[24px] font-bold leading-[1.2] text-ink">
          {formatEgpPrice(priceMinor)}
        </div>

        <PublicButton
          variant="primary-lg"
          fullWidth
          loading={ctaLoading}
          disabled={ctaDisabled}
          onClick={onCtaClick}
        >
          {ctaLabel}
        </PublicButton>

        {termsText && (
          <p className="text-[12px] leading-[1.4] text-ink-muted text-center">
            {termsText}
          </p>
        )}

        {footerExtra}
      </div>
    </aside>
  );
}
