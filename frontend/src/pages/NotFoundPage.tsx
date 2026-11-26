import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-[600px] px-md py-section text-center">
      <div className="bg-surface rounded-xxl p-xxxl shadow-raised space-y-md">
        <span className="inline-block text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
          404 — Page Not Found
        </span>
        <h1 className="text-[32px] font-bold text-ink">We couldn&apos;t find that page</h1>
        <p className="text-[14px] text-ink-secondary">
          The link may have moved, or the page you&apos;re looking for isn&apos;t available.
        </p>
        <div className="pt-sm">
          <Link
            to="/"
            className="inline-flex items-center gap-xs bg-primary hover:bg-primary-light text-on-primary text-[14px] font-semibold leading-none rounded-sm px-xl py-sm shadow-button transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
