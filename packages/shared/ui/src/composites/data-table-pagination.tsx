import type { Table } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '../primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../primitives/dropdown-menu';

interface Props<TData> {
  table: Table<TData>;
  pageSizeOptions?: number[];
  rowCount: number;
}

export function DataTablePagination<TData>({
  table,
  pageSizeOptions = [10, 25, 50, 100],
  rowCount,
}: Props<TData>) {
  const pageSize = table.getState().pagination.pageSize;
  const pageIndex = table.getState().pagination.pageIndex;
  const from = rowCount === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(rowCount, (pageIndex + 1) * pageSize);

  return (
    <div className="flex items-center justify-between px-md py-sm border-t border-hairline">
      <div className="text-caption text-ink-subtle">
        {from}–{to} of {rowCount}
      </div>
      <div className="flex items-center gap-md">
        <div className="flex items-center gap-xs">
          <span className="text-caption text-ink-subtle">Rows per page</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm">
                {pageSize}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {pageSizeOptions.map((s) => (
                <DropdownMenuItem key={s} onClick={() => table.setPageSize(s)}>
                  {s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="icon"
            aria-label="First"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.setPageIndex(0)}
          >
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Previous"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Next"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Last"
            disabled={!table.getCanNextPage()}
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
