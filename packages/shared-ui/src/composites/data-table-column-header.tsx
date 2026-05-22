import type { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type * as React from 'react';
import { cn } from '../lib/cn';
import { Button } from '../primitives/button';

interface Props<TData, TValue> {
  column: Column<TData, TValue>;
  title: React.ReactNode;
  className?: string;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: Props<TData, TValue>) {
  if (!column.getCanSort()) return <span className={className}>{title}</span>;

  const sorted = column.getIsSorted();
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        '-ml-2 h-7 px-2 gap-1.5 text-eyebrow uppercase tracking-[0.04em] font-medium text-ink-subtle hover:text-ink',
        className,
      )}
      onClick={(e) => column.getToggleSortingHandler()?.(e)}
    >
      <span>{title}</span>
      {sorted === 'desc' ? (
        <ArrowDown className="size-3" />
      ) : sorted === 'asc' ? (
        <ArrowUp className="size-3" />
      ) : (
        <ChevronsUpDown className="size-3 opacity-60" />
      )}
    </Button>
  );
}
