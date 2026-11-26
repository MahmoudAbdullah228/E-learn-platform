import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/cn';

interface CategoryTileProps {
  name: string;
  to: string;
  courseCountLabel?: string;
  icon?: ReactNode;
  className?: string;
}

export function CategoryTile({
  name,
  to,
  courseCountLabel,
  icon,
  className,
}: CategoryTileProps) {
  return (
    <Link
      to={to}
      className={cn(
        'group bg-surface rounded-md p-md flex flex-col items-center text-center gap-sm border border-hairline transition-shadow hover:shadow-tile-hover',
        className,
      )}
    >
      <div className="h-12 w-12 rounded-full bg-primary-tint text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors flex items-center justify-center">
        {icon ?? <BookOpen className="h-5 w-5" />}
      </div>
      <div className="space-y-xxs">
        <p className="text-[14px] font-semibold leading-[1.4] text-ink">{name}</p>
        {courseCountLabel && (
          <p className="text-[12px] text-ink-muted">{courseCountLabel}</p>
        )}
      </div>
    </Link>
  );
}
