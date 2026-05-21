import type { TaskWithAssigneesRow } from '@seta/planner';
import { DatePill, MiniGantt } from '@seta/shared-ui';
import { differenceInCalendarDays, getISOWeek, parseISO } from 'date-fns';
import { useUpdateTaskSchedule } from '../hooks/mutations/update-task-schedule';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
  today?: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TaskDetailScheduleCard({ task, planId, today }: Props) {
  const update = useUpdateTaskSchedule(planId);
  const todayDate = today ?? todayIso();
  const overdue =
    !!task.due_at &&
    !!todayDate &&
    parseISO(task.due_at) < parseISO(todayDate) &&
    !task.is_deferred;

  const summary = buildSummary(task.start_at, task.due_at);

  return (
    <section className="card" aria-label="Schedule">
      <header style={head}>
        <span className="t-sm subtle">Schedule</span>
      </header>
      <div style={pills}>
        <DatePill
          kind="Start"
          value={task.start_at}
          onChange={(start_at) =>
            update.mutate({ task_id: task.id, expected_version: task.version, start_at })
          }
          clearable
        />
        <DatePill
          kind="Due"
          value={task.due_at}
          onChange={(due_at) =>
            update.mutate({ task_id: task.id, expected_version: task.version, due_at })
          }
          overdue={overdue}
          clearable
        />
      </div>
      {summary && (
        <div className="t-xs subtle" style={{ marginTop: 4 }}>
          {summary}
        </div>
      )}
      {task.start_at && task.due_at && (
        <div style={{ marginTop: 8 }}>
          <MiniGantt start={task.start_at} due={task.due_at} today={todayDate} title={task.title} />
        </div>
      )}
    </section>
  );
}

function buildSummary(start: string | null, due: string | null): string | null {
  if (!start || !due) return null;
  const days = differenceInCalendarDays(parseISO(due), parseISO(start)) + 1;
  const week = getISOWeek(parseISO(start));
  return `${days}-day range · spans week ${week}`;
}

const head = {
  marginBottom: 6,
};
const pills = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap' as const,
};
