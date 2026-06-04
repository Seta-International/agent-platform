import type { TaskWithAssigneesRow } from '@seta/planner';
import { useMemo } from 'react';
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

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto px-7 pb-4"
      data-testid="calendar-grid"
    >
      <div className="grid grid-cols-7 border-b border-hairline">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="px-2 py-1 text-caption font-medium text-ink-muted">
            {d}
          </div>
        ))}
      </div>
      <div className="border-l border-t border-hairline">
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
          />
        ))}
      </div>
    </div>
  );
}
