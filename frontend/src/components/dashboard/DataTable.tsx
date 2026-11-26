import { Table, type TableProps } from 'antd';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface DataTableProps<T extends object> extends TableProps<T> {
  toolbarLeft?: ReactNode;
  toolbarRight?: ReactNode;
  containerClassName?: string;
}

export function DataTable<T extends object>({
  toolbarLeft,
  toolbarRight,
  containerClassName,
  className,
  pagination,
  ...tableProps
}: DataTableProps<T>) {
  const hasToolbar = Boolean(toolbarLeft || toolbarRight);

  return (
    <div
      className={cn(
        'bg-surface rounded-lg border border-border shadow-card overflow-hidden',
        containerClassName,
      )}
    >
      {hasToolbar && (
        <div className="px-md py-sm border-b border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-sm bg-surface">
          <div className="flex-1 min-w-0">{toolbarLeft}</div>
          <div className="flex items-center gap-xs flex-wrap">{toolbarRight}</div>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table<T>
          pagination={pagination}
          className={cn('pathly-data-table', className)}
          {...tableProps}
        />
      </div>
    </div>
  );
}
