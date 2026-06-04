import { Button } from '@seta/shared-ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CALENDAR_PAGE_SIZE } from '../../hooks/queries/use-calendar-tasks';

interface Props {
  page: number; // 1-based
  totalCount: number;
  hasNext: boolean;
  onPageChange: (page: number) => void;
}

export function CalendarPagination({ page, totalCount, hasNext, onPageChange }: Props) {
  if (totalCount <= CALENDAR_PAGE_SIZE) return null;
  const from = (page - 1) * CALENDAR_PAGE_SIZE + 1;
  const to = Math.min(totalCount, page * CALENDAR_PAGE_SIZE);
  return (
    <div
      className="flex items-center justify-end gap-2 border-t border-hairline px-7 py-2 text-caption text-ink-muted"
      data-testid="calendar-pagination"
    >
      <span>
        Showing {Math.min(from, totalCount)}–{to} of {totalCount}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="size-7"
      >
        <ChevronLeft className="size-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Next page"
        disabled={!hasNext}
        onClick={() => onPageChange(page + 1)}
        className="size-7"
      >
        <ChevronRight className="size-3" />
      </Button>
    </div>
  );
}
