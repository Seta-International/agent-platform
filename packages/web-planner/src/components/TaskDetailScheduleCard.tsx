import type { TaskWithAssigneesRow } from '@seta/planner';
import { DateInput } from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { parseISO } from 'date-fns';
import { useUpdateTaskSchedule } from '../hooks/mutations/update-task-schedule';
import { PERMISSION_DENIED } from '../lib/permission-messages';

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
  const canUpdate = usePermission('planner.task.update');
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
          disabled={!canUpdate}
          onChange={(start_at) =>
            update.mutate({ task_id: task.id, expected_version: task.version, start_at })
          }
        />
        <DateField
          label="Due"
          value={task.due_at}
          danger={overdue}
          disabled={!canUpdate}
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
  danger?: boolean;
  disabled?: boolean;
  onChange: (next: string | null) => void;
}

function DateField({ label, value, danger, disabled, onChange }: DateFieldProps) {
  const dateValue = toDateInputValue(value);
  return (
    <DateInput
      label={label}
      value={dateValue || undefined}
      isDisabled={disabled}
      disabledMessage={disabled ? PERMISSION_DENIED.task.edit : undefined}
      hasClear
      status={danger ? { type: 'error' } : undefined}
      onChange={(v) => onChange(fromDateInputValue(v ?? ''))}
    />
  );
}
