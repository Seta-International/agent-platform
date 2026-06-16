import { Button } from '@seta/shared-ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  type CalendarMode,
  currentMonthRange,
  currentWeekRange,
  deriveCalendarMode,
  rangeLabel,
  shiftRange,
  toModeRange,
} from '../../lib/calendar-dates';

interface Props {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  totalCount: number;
  onRangeChange: (from: string, to: string) => void;
}

export function CalendarToolbar({ from, to, totalCount, onRangeChange }: Props) {
  const mode = deriveCalendarMode(from, to);

  function setMode(next: CalendarMode) {
    if (next === mode) return;
    const r = toModeRange(from, next);
    onRangeChange(r.from, r.to);
  }

  function onToday() {
    const r = mode === 'week' ? currentWeekRange(new Date()) : currentMonthRange(new Date());
    onRangeChange(r.from, r.to);
  }

  function onShift(dir: 1 | -1) {
    const r = shiftRange(from, to, dir);
    onRangeChange(r.from, r.to);
  }

  return (
    <div className="flex items-center justify-between px-7 py-3" data-testid="calendar-toolbar">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Previous range" onClick={() => onShift(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Next range" onClick={() => onShift(1)}>
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onToday}>
          Today
        </Button>
        <h2 className="ml-2 text-card-title text-ink">{rangeLabel(from, to)}</h2>
        <span className="text-caption text-ink-muted" data-testid="calendar-total-count">
          {totalCount} task{totalCount === 1 ? '' : 's'}
        </span>
      </div>
      <div className="plan-view-switcher">
        <button type="button" aria-pressed={mode === 'week'} onClick={() => setMode('week')}>
          <span>Week</span>
        </button>
        <button type="button" aria-pressed={mode === 'month'} onClick={() => setMode('month')}>
          <span>Month</span>
        </button>
      </div>
    </div>
  );
}
