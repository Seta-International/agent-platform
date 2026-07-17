import { Button, Heading, SegmentedControl, SegmentedControlItem } from '@seta/shared-ui';
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
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          icon={<ChevronLeft className="size-4" />}
          label="Previous range"
          onClick={() => onShift(-1)}
        />
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          icon={<ChevronRight className="size-4" />}
          label="Next range"
          onClick={() => onShift(1)}
        />
        <Button variant="ghost" size="sm" label="Today" onClick={onToday} />
        <Heading level={2} className="ml-2">
          {rangeLabel(from, to)}
        </Heading>
        <span className="text-caption text-ink-muted" data-testid="calendar-total-count">
          {totalCount} task{totalCount === 1 ? '' : 's'}
        </span>
      </div>
      <SegmentedControl
        label="Calendar range"
        size="sm"
        value={mode}
        onChange={(v) => setMode(v as CalendarMode)}
      >
        <SegmentedControlItem value="week" label="Week" />
        <SegmentedControlItem value="month" label="Month" />
      </SegmentedControl>
    </div>
  );
}
