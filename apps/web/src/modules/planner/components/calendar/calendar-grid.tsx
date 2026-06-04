import type { TaskWithAssigneesRow } from '@seta/planner';
import { cn } from '@seta/shared-ui';
import { useMemo } from 'react';
import { deriveCalendarMode } from '../../lib/calendar-dates';
import { assignWeekSpans, buildCalendarWeeks } from '../../lib/calendar-lanes';
import { CalendarWeekRow } from './calendar-week-row';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  tasks: TaskWithAssigneesRow[];
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  todayKey: string;
  onOpenTask: (taskId: string) => void;
  onSelectDate?: (dayKey: string) => void;
}

export function CalendarGrid({ tasks, from, to, todayKey, onOpenTask, onSelectDate }: Props) {
  const weeks = useMemo(() => buildCalendarWeeks(from, to), [from, to]);
  const weekSpans = useMemo(
    () => weeks.map((week) => assignWeekSpans(tasks, week)),
    [weeks, tasks],
  );
  const isWeekMode = deriveCalendarMode(from, to) === 'week';

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto px-7 pb-4"
      data-testid="calendar-grid"
    >
      <div className="grid grid-cols-7 border-b border-hairline">
        {WEEKDAY_LABELS.map((d, i) => {
          const dayKey = isWeekMode ? (weeks[0]?.[i] ?? '') : '';
          const dayNum = isWeekMode ? Number(dayKey.slice(8, 10)) : null;
          const isToday = isWeekMode && dayKey === todayKey;
          return (
            <div key={d} className="px-2 py-1 text-caption font-medium">
              {dayNum !== null ? (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5',
                    isToday ? 'bg-primary text-white' : 'text-ink-muted',
                  )}
                >
                  {dayNum} {d}
                </span>
              ) : (
                <span className="text-ink-muted">{d}</span>
              )}
            </div>
          );
        })}
      </div>
      <div
        className={cn('border-l border-t border-hairline', isWeekMode && 'flex flex-1 flex-col')}
      >
        {weeks.map((week, i) => (
          <CalendarWeekRow
            key={week[0]}
            weekDays={week}
            spans={weekSpans[i] ?? []}
            rangeFrom={from}
            rangeTo={to}
            todayKey={todayKey}
            onOpenTask={onOpenTask}
            onSelectDate={onSelectDate}
            fillHeight={isWeekMode}
            hideDate={isWeekMode}
          />
        ))}
      </div>
    </div>
  );
}
