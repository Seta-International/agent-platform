import type { Table } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from '../primitives/button';
import { DropdownMenu, DropdownMenuItem } from '../primitives/dropdown-menu';

interface Props<TData> {
  table: Table<TData>;
  pageSizeOptions?: number[];
  rowCount: number;
}

const MAX_VISIBLE_PAGES = 5;

function buildPageWindow(pageIndex: number, pageCount: number): Array<number | 'ellipsis'> {
  if (pageCount <= MAX_VISIBLE_PAGES + 2) {
    return Array.from({ length: pageCount }, (_, i) => i);
  }
  const pages: Array<number | 'ellipsis'> = [];
  const left = Math.max(1, pageIndex - 1);
  const right = Math.min(pageCount - 2, pageIndex + 1);
  pages.push(0);
  if (left > 1) pages.push('ellipsis');
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < pageCount - 2) pages.push('ellipsis');
  pages.push(pageCount - 1);
  return pages;
}

export function DataTablePagination<TData>({
  table,
  pageSizeOptions = [10, 25, 50, 100],
  rowCount,
}: Props<TData>) {
  const pageSize = table.getState().pagination.pageSize;
  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = Math.max(1, table.getPageCount());
  const from = rowCount === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(rowCount, (pageIndex + 1) * pageSize);
  const pages = buildPageWindow(pageIndex, pageCount);

  return (
    <div className="flex h-11 items-center justify-between border-t border-hairline bg-canvas px-lg text-caption text-ink-muted">
      <span>
        Showing {from}–{to} of {rowCount}
      </span>
      <div className="flex items-center gap-md">
        <div className="flex items-center gap-xs">
          <span className="text-ink-subtle">Rows per page</span>
          <DropdownMenu
            placement="below"
            menuWidth={80}
            hasChevron
            button={{
              variant: 'ghost',
              size: 'sm',
              label: `${pageSize} rows per page`,
              children: pageSize,
            }}
          >
            {pageSizeOptions.map((s) => (
              <DropdownMenuItem
                key={s}
                label={String(s)}
                onClick={() => table.setPageSize(s)}
                style={
                  s === pageSize
                    ? { backgroundColor: 'var(--color-surface-2)', color: 'var(--color-ink)' }
                    : undefined
                }
              />
            ))}
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            icon={<ChevronLeft className="size-3" />}
            label="Previous"
            isDisabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            className="size-7"
          />
          {pages.map((p, i) =>
            p === 'ellipsis' ? (
              <span
                key={`ellipsis-${pages[i - 1] ?? 'start'}-${pages[i + 1] ?? 'end'}`}
                aria-hidden
                className="px-1 text-ink-subtle"
              >
                …
              </span>
            ) : (
              <Button
                key={p}
                variant="ghost"
                size="sm"
                label={`Page ${p + 1}`}
                aria-current={p === pageIndex ? 'page' : undefined}
                onClick={() => table.setPageIndex(p)}
                className={cn(
                  'h-7 min-w-7 px-2 text-ink-muted',
                  p === pageIndex && 'bg-surface-2 text-ink',
                )}
              >
                {p + 1}
              </Button>
            ),
          )}
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            icon={<ChevronRight className="size-3" />}
            label="Next"
            isDisabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            className="size-7"
          />
        </div>
      </div>
    </div>
  );
}
