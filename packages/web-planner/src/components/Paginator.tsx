import { Button, cn, DropdownMenu, DropdownMenuItem } from '@seta/shared-ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  pageIndex: number;
  pageSize: number;
  total: number;
  pageSizeOptions?: number[];
  onPageChange: (next: number) => void;
  onPageSizeChange: (next: number) => void;
  itemLabel?: string;
  className?: string;
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

export function Paginator({
  pageIndex,
  pageSize,
  total,
  pageSizeOptions = [10, 25, 50, 100],
  onPageChange,
  onPageSizeChange,
  itemLabel,
  className,
}: Props) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const from = total === 0 ? 0 : safePageIndex * pageSize + 1;
  const to = Math.min(total, (safePageIndex + 1) * pageSize);
  const pages = buildPageWindow(safePageIndex, pageCount);
  const canPrev = safePageIndex > 0;
  const canNext = safePageIndex < pageCount - 1;
  const labelSingular = itemLabel ?? '';

  return (
    <div
      className={cn(
        'flex h-11 items-center justify-between border-t border-border bg-body px-4 text-sm text-secondary',
        className,
      )}
    >
      <span>
        {total === 0 ? (
          <>No {labelSingular ? `${labelSingular}s` : 'results'}</>
        ) : (
          <>
            Showing {from}–{to} of {total}
            {labelSingular ? ` ${labelSingular}${total === 1 ? '' : 's'}` : ''}
          </>
        )}
      </span>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-secondary">Rows per page</span>
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
                onClick={() => onPageSizeChange(s)}
                style={
                  s === pageSize
                    ? {
                        backgroundColor: 'var(--color-background-surface)',
                        color: 'var(--color-text-primary)',
                      }
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
            label="Previous page"
            isDisabled={!canPrev}
            onClick={() => onPageChange(safePageIndex - 1)}
            className="size-7"
          />
          {pages.map((p, i) =>
            p === 'ellipsis' ? (
              <span
                key={`ellipsis-${pages[i - 1] ?? 'start'}-${pages[i + 1] ?? 'end'}`}
                aria-hidden
                className="px-1 text-secondary"
              >
                …
              </span>
            ) : (
              <Button
                key={p}
                variant="ghost"
                size="sm"
                label={`Page ${p + 1}`}
                aria-current={p === safePageIndex ? 'page' : undefined}
                onClick={() => onPageChange(p)}
                className={cn(
                  'h-7 min-w-7 px-2 text-secondary',
                  p === safePageIndex && 'bg-surface text-primary',
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
            label="Next page"
            isDisabled={!canNext}
            onClick={() => onPageChange(safePageIndex + 1)}
            className="size-7"
          />
        </div>
      </div>
    </div>
  );
}
