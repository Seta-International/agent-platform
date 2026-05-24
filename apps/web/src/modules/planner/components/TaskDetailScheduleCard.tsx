import type { TaskWithAssigneesRow } from '@seta/planner';
import { MiniGantt } from '@seta/shared-ui';
import { differenceInCalendarDays, getISOWeek, parseISO } from 'date-fns';
import { CalendarDays, X } from 'lucide-react';
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
      <header className="mb-1.5">
        <span className="t-sm subtle">Schedule</span>
      </header>
      <div className="flex flex-col gap-2">
        <DateField
          label="Start"
          value={task.start_at}
          ariaLabel="Start"
          onChange={(start_at) =>
            update.mutate({ task_id: task.id, expected_version: task.version, start_at })
          }
        />
        <DateField
          label="Due"
          value={task.due_at}
          ariaLabel="Due"
          danger={overdue}
          onChange={(due_at) =>
            update.mutate({ task_id: task.id, expected_version: task.version, due_at })
          }
        />
      </div>
      {summary && <div className="t-xs subtle mt-2">{summary}</div>}
      {task.start_at && task.due_at && (
        <div className="mt-2">
          <MiniGantt start={task.start_at} due={task.due_at} today={todayDate} title={task.title} />
        </div>
      )}
    </section>
  );
}

interface DateFieldProps {
  label: string;
  value: string | null;
  ariaLabel: string;
  danger?: boolean;
  onChange: (next: string | null) => void;
}

function DateField({ label, value, ariaLabel, danger, onChange }: DateFieldProps) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-body-sm ${
        danger
          ? 'border-semantic-danger bg-semantic-danger-tint text-semantic-danger'
          : 'border-hairline bg-canvas text-ink'
      }`}
    >
      <CalendarDays
        className={`size-3.5 ${danger ? 'text-semantic-danger' : 'text-ink-subtle'}`}
        aria-hidden
      />
      <span
        className={`text-caption font-medium ${danger ? 'text-semantic-danger' : 'text-ink-subtle'}`}
      >
        {label}
      </span>
      <input
        type="date"
        aria-label={ariaLabel}
        value={value ?? ''}
        onChange={(e) => onChange(e.currentTarget.value || null)}
        className="mono flex-1 bg-transparent text-body-sm text-ink outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`Clear ${label}`}
          className="text-ink-subtle hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function buildSummary(start: string | null, due: string | null): string | null {
  if (!start || !due) return null;
  const days = differenceInCalendarDays(parseISO(due), parseISO(start)) + 1;
  const week = getISOWeek(parseISO(start));
  return `${days}-day range · spans week ${week}`;
}
