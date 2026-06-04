import { cn } from '@seta/shared-ui';
import type { TaskSpan } from '../../lib/calendar-lanes';
import { CalendarDayCell } from './calendar-day-cell';
import { TaskSpanBar } from './task-span-bar';

interface Props {
  weekDays: string[]; // 7 date keys, Monday first
  spans: TaskSpan[];
  rangeFrom: string;
  rangeTo: string;
  todayKey: string;
  onOpenTask: (taskId: string) => void;
  onSelectDate?: (dayKey: string) => void;
  /** Week mode: stretch the row to fill the remaining container height. */
  fillHeight?: boolean;
  /** Week mode: date is shown in the grid header instead of each cell. */
  hideDate?: boolean;
}

const HEADER_REM = 2.25; // day-number strip
const LANE_REM = 2; // 1.75rem bar + .25rem gap

export function CalendarWeekRow({
  weekDays,
  spans,
  rangeFrom,
  rangeTo,
  todayKey,
  onOpenTask,
  onSelectDate,
  fillHeight = false,
  hideDate = false,
}: Props) {
  const laneCount = spans.reduce((m, s) => Math.max(m, s.lane + 1), 0);
  const headerRem = HEADER_REM;
  // Row grows with its busiest day; never below a comfortable month-cell height.
  const minHeight = Math.max(7, headerRem + 0.5 + laneCount * LANE_REM);

  return (
    <div
      className={cn('relative', fillHeight && 'flex-1 min-h-0')}
      style={fillHeight ? undefined : { minHeight: `${minHeight}rem` }}
      data-testid="calendar-week-row"
    >
      {/* Background layer: day cells (click targets, day numbers). */}
      <div className="absolute inset-0 grid grid-cols-7">
        {weekDays.map((d) => (
          <CalendarDayCell
            key={d}
            dayKey={d}
            inRange={d >= rangeFrom && d <= rangeTo}
            isToday={d === todayKey}
            hideDate={hideDate}
            onSelectDate={onSelectDate}
          />
        ))}
      </div>
      {/* Overlay layer: task bars. pointer-events-none lets clicks fall
          through to day cells; the bars re-enable their own pointer events. */}
      {laneCount > 0 && (
        <div
          className="pointer-events-none relative z-10 grid grid-cols-7 gap-y-1"
          style={{ marginTop: `${headerRem}rem`, gridAutoRows: '1.75rem' }}
        >
          {spans.map((s) => (
            <TaskSpanBar key={`${s.task.id}-${s.startCol}`} span={s} onOpenTask={onOpenTask} />
          ))}
        </div>
      )}
    </div>
  );
}
