import { cn } from '@seta/shared-ui';

interface Props {
  dayKey: string; // YYYY-MM-DD
  /** False for padding days outside the selected range — rendered dimmed. */
  inRange: boolean;
  isToday: boolean;
  /** Week mode: date is shown in the grid header instead of each cell. */
  hideDate?: boolean;
  /** Absent until plan 4 wires quick-create; cell is inert without it. */
  onSelectDate?: (dayKey: string) => void;
}

export function CalendarDayCell({
  dayKey,
  inRange,
  isToday,
  hideDate = false,
  onSelectDate,
}: Props) {
  const dayNum = Number(dayKey.slice(8, 10));
  return (
    <button
      type="button"
      data-testid={`calendar-day-${dayKey}`}
      aria-label={`Day ${dayKey}`}
      disabled={onSelectDate === undefined}
      onClick={() => onSelectDate?.(dayKey)}
      className={cn(
        'h-full border-b border-r border-hairline p-1 text-left align-top',
        onSelectDate !== undefined && 'hover:bg-surface-2',
        !inRange && 'opacity-40',
      )}
    >
      {!hideDate && (
        <span
          className={cn(
            'inline-flex size-6 items-center justify-center rounded-full text-caption',
            isToday ? 'font-medium text-ink ring-2 ring-primary' : 'text-ink-muted',
          )}
        >
          {dayNum}
        </span>
      )}
    </button>
  );
}
