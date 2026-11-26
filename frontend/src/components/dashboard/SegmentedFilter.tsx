import { Segmented } from 'antd';
import { cn } from '@/lib/cn';

export interface DashboardSegmentOption<T extends string> {
  label: string;
  value: T;
}

interface SegmentedFilterProps<T extends string> {
  options: DashboardSegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentedFilter<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentedFilterProps<T>) {
  return (
    <Segmented<T>
      options={options}
      value={value}
      onChange={onChange}
      className={cn('bg-surface border border-border p-xxs rounded-md', className)}
    />
  );
}
