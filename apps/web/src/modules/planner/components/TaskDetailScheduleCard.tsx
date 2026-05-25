import type { TaskWithAssigneesRow } from '@seta/planner';
import { parseISO } from 'date-fns';
import { CalendarDays, X } from 'lucide-react';
import { useId } from 'react';
import { useUpdateTaskSchedule } from '../hooks/mutations/update-task-schedule';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
  today?: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// The DB stores start_at/due_at as full timestamptz ISO strings, but
// <input type="date"> only accepts/emits YYYY-MM-DD. Convert at the boundary
// so the picker actually reflects the saved value, and saves round-trip
// through the strict `.datetime({ offset: true })` schema on the backend.
function toDateInputValue(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function fromDateInputValue(value: string): string | null {
  if (!value) return null;
  // Anchor at UTC midnight so the value the user picked is the same day in any
  // timezone the server formats it back in.
  return `${value}T00:00:00.000Z`;
}

export function TaskDetailScheduleCard({ task, planId, today }: Props) {
  const update = useUpdateTaskSchedule(planId);
  const todayDate = today ?? todayIso();
  const overdue =
    !!task.due_at &&
    !!todayDate &&
    parseISO(task.due_at) < parseISO(todayDate) &&
    !task.is_deferred;

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
  const dateValue = toDateInputValue(value);
  const inputId = useId();
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
      <label
        htmlFor={inputId}
        className={`text-caption font-medium ${danger ? 'text-semantic-danger' : 'text-ink-subtle'}`}
      >
        {label}
      </label>
      <input
        id={inputId}
        type="date"
        aria-label={ariaLabel}
        value={dateValue}
        onChange={(e) => onChange(fromDateInputValue(e.currentTarget.value))}
        className="mono flex-1 bg-transparent text-body-sm text-ink outline-none"
      />
      {dateValue && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`Reset ${ariaLabel.toLowerCase()} date`}
          className="text-ink-subtle hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
