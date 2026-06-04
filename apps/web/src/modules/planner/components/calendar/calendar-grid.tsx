import type { EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import FullCalendar from '@fullcalendar/react';
import type { TaskWithAssigneesRow } from '@seta/planner';
import { useEffect, useMemo, useRef } from 'react';
import { deriveCalendarMode } from '../../lib/calendar-dates';
import { taskToFCEvent } from '../../lib/task-to-event';
import { TaskEventCard } from './task-event-card';

interface Props {
  tasks: TaskWithAssigneesRow[];
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  onOpenTask: (taskId: string) => void;
  onRescheduleTask: (
    task: TaskWithAssigneesRow,
    newStart: Date | null,
    newEnd: Date | null,
    revert: () => void,
  ) => void;
  /** Wired to FC's dateClick. Plan 4 passes setQuickCreateDate here. */
  onSelectDate?: (dateKey: string) => void;
}

export function CalendarGrid({
  tasks,
  from,
  to,
  onOpenTask,
  onRescheduleTask,
  onSelectDate,
}: Props) {
  const calendarRef = useRef<FullCalendar>(null);
  const isWeekMode = deriveCalendarMode(from, to) === 'week';

  const events = useMemo<EventInput[]>(
    () => tasks.map(taskToFCEvent).filter((e) => e.start !== undefined),
    [tasks],
  );

  // Keep FC's internal state in sync with URL-driven range and mode changes.
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api.changeView(isWeekMode ? 'dayGridWeek' : 'dayGridMonth');
    api.gotoDate(from);
  }, [from, isWeekMode]);

  return (
    <div
      className={
        isWeekMode
          ? 'flex min-h-0 flex-1 flex-col overflow-hidden px-7 pb-4'
          : 'flex min-h-0 flex-1 flex-col overflow-y-auto px-7 pb-4'
      }
      data-testid="calendar-grid"
    >
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView={isWeekMode ? 'dayGridWeek' : 'dayGridMonth'}
        initialDate={from}
        firstDay={1}
        headerToolbar={false}
        height={isWeekMode ? '100%' : 'auto'}
        expandRows={isWeekMode}
        events={events}
        editable={true}
        eventContent={({ event }) => (
          <TaskEventCard task={event.extendedProps.task as TaskWithAssigneesRow} />
        )}
        eventClick={({ event }) => onOpenTask(event.id)}
        eventDrop={({ event, revert }) =>
          onRescheduleTask(
            event.extendedProps.task as TaskWithAssigneesRow,
            event.start,
            event.end,
            revert,
          )
        }
        dateClick={({ dateStr }) => onSelectDate?.(dateStr)}
      />
    </div>
  );
}
