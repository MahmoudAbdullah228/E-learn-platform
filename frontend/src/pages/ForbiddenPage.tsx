import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { PublicButton } from '@/components/public';

interface ForbiddenPageProps {
  title?: string;
  description?: string;
}

export function ForbiddenPage({
  title = 'Access Denied',
  description = 'You do not have permission to view this page.',
}: ForbiddenPageProps) {
  const user = useAppSelector((state) => state.auth.user);
  const homePath = user?.roles.includes('admin')
    ? '/admin/dashboard'
    : user?.roles.includes('instructor')
      ? '/instructor/dashboard'
      : user
        ? '/app/dashboard'
        : '/';

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-md">
      <div className="max-w-[520px] w-full bg-surface rounded-xxl p-xxxl shadow-raised border border-hairline text-center space-y-md">
        <div className="h-14 w-14 rounded-full bg-error-bg text-error flex items-center justify-center mx-auto">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <span className="inline-block text-[12px] font-bold uppercase tracking-[0.06em] text-error">
          403 — Insufficient Permissions
        </span>
        <h1 className="text-[28px] font-bold text-ink">{title}</h1>
        <p className="text-[14px] text-ink-secondary">{description}</p>
        <div className="pt-xs flex items-center justify-center gap-sm">
          <PublicButton variant="primary" asChild>
            <Link to={homePath}>Return to Dashboard</Link>
          </PublicButton>
          <PublicButton variant="secondary" asChild>
            <Link to="/">Home</Link>
          </PublicButton>
        </div>
      </div>
    </div>
  );
}
