import type { EventInput } from '@fullcalendar/core';
import type { TaskWithAssigneesRow } from '@seta/planner';
import { addDaysKey, toDateKey } from './calendar-dates';

export function taskToFCEvent(task: TaskWithAssigneesRow): EventInput {
  const startKey = task.start_at ? toDateKey(new Date(task.start_at)) : null;
  const endKey = task.due_at ? toDateKey(new Date(task.due_at)) : null;
  return {
    id: task.id,
    title: task.title,
    start: startKey ?? endKey ?? undefined,
    // FC all-day event end is exclusive — add 1 day so due_at renders on the correct day.
    end: endKey ? addDaysKey(endKey, 1) : undefined,
    allDay: true,
    extendedProps: { task },
  };
}
