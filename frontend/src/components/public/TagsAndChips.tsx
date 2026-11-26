import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CategoryTagProps {
  children: ReactNode;
  className?: string;
}

export function CategoryTag({ children, className }: CategoryTagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center bg-canvas text-primary text-[11px] font-medium leading-[1.2] rounded-xs px-xs py-xxs',
        className,
      )}
    >
      {children}
    </span>
  );
}

interface FilterChipProps {
  label: string;
  onRemove: () => void;
  className?: string;
}

export function FilterChip({ label, onRemove, className }: FilterChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-xs bg-surface text-ink border border-border text-[13px] leading-[1.5] rounded-full px-sm py-xxs',
        className,
      )}
    >
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="text-ink-muted hover:text-ink transition-colors cursor-pointer"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

export interface SegmentedOption<T extends string> {
  label: string;
  value: T;
}

interface PublicSegmentedFilterProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function PublicSegmentedFilter<T extends string>({
  options,
  value,
  onChange,
  className,
}: PublicSegmentedFilterProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center bg-surface border border-border rounded-md p-xxs gap-xxs',
        className,
      )}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              'px-md py-xs text-[14px] font-medium rounded-sm transition-colors cursor-pointer',
              isActive
                ? 'bg-primary text-on-primary font-semibold'
                : 'text-ink hover:text-primary',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
