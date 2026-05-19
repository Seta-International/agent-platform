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
      className={cn('-ml-3 h-8', className)}
      onClick={(e) => column.getToggleSortingHandler()?.(e)}
    >
      <span>{title}</span>
      {sorted === 'desc' ? (
        <ArrowDown className="ml-2 size-3.5" />
      ) : sorted === 'asc' ? (
        <ArrowUp className="ml-2 size-3.5" />
      ) : (
        <ChevronsUpDown className="ml-2 size-3.5" />
      )}
    </Button>
  );
}
