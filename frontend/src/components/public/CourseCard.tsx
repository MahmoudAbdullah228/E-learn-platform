import { BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CategoryTag } from '@/components/public/TagsAndChips';
import { cn } from '@/lib/cn';
import { formatEgpPrice } from '@/lib/formatters';

export interface CourseCardProps {
  slug: string;
  title: string;
  instructorName: string;
  categoryName?: string | null;
  priceMinor: number;
  coverUrl?: string | null;
  className?: string;
}

export function CourseCard({
  slug,
  title,
  instructorName,
  categoryName,
  priceMinor,
  coverUrl,
  className,
}: CourseCardProps) {
  return (
    <Link
      to={`/courses/${slug}`}
      className={cn(
        'group bg-surface rounded-xl p-md border border-hairline flex flex-col overflow-hidden transition-shadow hover:shadow-hover',
        className,
      )}
    >
      <div className="-mx-md -mt-md mb-md aspect-video bg-primary-tint overflow-hidden flex items-center justify-center">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <BookOpen className="h-10 w-10 text-primary/60" aria-hidden="true" />
        )}
      </div>

      <div className="flex-1 flex flex-col justify-between gap-sm">
        <div className="space-y-xxs">
          <h3 className="text-[16px] font-semibold leading-[1.4] text-ink line-clamp-2 group-hover:text-primary transition-colors">
            {title}
          </h3>
          <p className="text-[12px] text-ink-muted">By {instructorName}</p>
        </div>

        <div className="flex items-center justify-between gap-xs pt-xs border-t border-hairline">
          {categoryName ? <CategoryTag>{categoryName}</CategoryTag> : <span />}
          <span className="text-[18px] font-bold leading-[1.3] text-primary">
            {formatEgpPrice(priceMinor)}
          </span>
        </div>
      </div>
    </Link>
  );
}
