import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import type { TaskWithPlan } from '@seta/planner';
import { AvatarStack, LabelChip, SyncBadge } from '@seta/shared-ui';
import { Link } from '@tanstack/react-router';
import { Calendar, GripVertical } from 'lucide-react';
import { deriveTaskStatus } from '../../lib/derive-task-status';
import { PriorityChip } from './priority-chip';
import { ProgressBar } from './progress-bar';
import { StatusInline } from './status-inline';

export type MyTasksRowLabelColor = 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'teal';

export interface MyTasksRowLabel {
  name: string;
  color?: MyTasksRowLabelColor;
}

export interface MyTasksRowAssignee {
  user_id: string;
  display_name: string;
}

export interface MyTasksRowTask extends TaskWithPlan {
  labels?: ReadonlyArray<MyTasksRowLabel>;
  daysLate?: number;
  assignees?: ReadonlyArray<MyTasksRowAssignee>;
}

interface Props {
  task: MyTasksRowTask;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
}

function computeDaysLate(dueAt: string | null, now: Date): number | undefined {
  if (!dueAt) return undefined;
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(due)) return undefined;
  const diffMs = now.getTime() - due;
  if (diffMs <= 0) return undefined;
  return Math.ceil(diffMs / 86_400_000);
}

function formatDueShort(dueAt: string | null): string {
  if (!dueAt) return '—';
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function MtTaskRow({ task, dragHandleProps }: Props) {
  const status = deriveTaskStatus(task);
  const daysLate = task.daysLate ?? computeDaysLate(task.due_at, new Date());
  const overdue = (daysLate ?? 0) > 0;

  return (
    <Link
      to="/planner/plans/$planId/tasks/$taskId"
      params={{ planId: task.plan_id, taskId: task.id }}
      data-task-row=""
      data-task-id={task.id}
      className={
        'grid grid-cols-[24px_60px_minmax(0,1fr)_90px_130px_100px_110px_120px] ' +
        'gap-3 items-center px-6 pr-3.5 py-2.5 ' +
        'border-t border-hairline-tertiary text-[13px] no-underline text-ink relative'
      }
    >
      <button
        type="button"
        data-drag-handle=""
        tabIndex={-1}
        aria-label="Drag task"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        {...(dragHandleProps ?? {})}
        className="inline-flex items-center cursor-grab opacity-60 bg-transparent border-0 p-0"
      >
        <GripVertical size={12} className="text-ink-tertiary" />
      </button>

      <span className="font-mono text-[11px] text-ink-subtle bg-surface-2 px-1.5 py-0.5 rounded-xs justify-self-start">
        {task.id}
      </span>

      <div className="min-w-0 flex flex-col gap-[3px]">
        <span className="font-medium whitespace-nowrap overflow-hidden text-ellipsis">
          {task.title}
        </span>
        <div className="flex items-center gap-2">
          <StatusInline status={status} />
          {task.external_source === 'm365' && (
            <SyncBadge
              state={task.sync_status ?? null}
              synced_at={task.external_synced_at ?? null}
              size="mini"
            />
          )}
          {daysLate !== undefined && daysLate > 0 ? (
            <span className="text-[11px] text-danger font-medium">· {daysLate}d late</span>
          ) : null}
        </div>
      </div>

      <PriorityChip prio={task.priority_number} />

      <ProgressBar pct={task.percent_complete} status={status} />

      <span
        data-testid="task-due"
        className={
          'inline-flex items-center gap-1.5 text-[12.5px] ' +
          (overdue ? 'text-danger font-medium' : 'text-ink-muted')
        }
      >
        <Calendar size={11} />
        {formatDueShort(task.due_at)}
      </span>

      <div data-testid="task-labels" className="flex gap-1 flex-nowrap overflow-hidden">
        {(task.labels ?? []).slice(0, 2).map((l) => (
          <LabelChip key={l.name} name={l.name} color={l.color ?? 'blue'} />
        ))}
      </div>

      <div data-testid="avatar-stack" className="flex justify-start">
        <AvatarStack assignees={task.assignees ?? []} max={2} />
      </div>
    </Link>
  );
}
