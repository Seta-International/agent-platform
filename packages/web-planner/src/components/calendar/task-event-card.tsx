import type { TaskWithAssigneesRow } from '@seta/planner';
import { AvatarStack, cn } from '@seta/shared-ui';
import { TriangleAlert } from 'lucide-react';
import { formatDueShort } from '../../lib/format-due-short';
import { priorityLabel } from '../../state/task-derived';

const PRIORITY_STRIPE: Record<ReturnType<typeof priorityLabel>, string> = {
  urgent: 'var(--color-icon-red)',
  important: 'var(--color-icon-orange)',
  medium: 'var(--color-icon-blue)',
  low: 'var(--color-icon-gray)',
};

interface Props {
  task: TaskWithAssigneesRow;
}

/**
 * Rendered as FC's eventContent — FC owns positioning, spanning, and click.
 * Uses a div (not a button) to avoid nesting interactive elements inside
 * FC's own event wrapper.
 */
export function TaskEventCard({ task }: Props) {
  return (
    <div
      data-testid={`task-event-${task.id}`}
      className={cn(
        'flex min-w-0 w-full items-center gap-1.5 border-l-4 bg-card px-1.5',
        'text-sm text-primary shadow-sm cursor-pointer hover:bg-surface',
      )}
      style={{ borderLeftColor: PRIORITY_STRIPE[priorityLabel(task.priority_number)] }}
    >
      <span className="min-w-0 flex-1 truncate">{task.title}</span>
      {task.sync_status === 'conflict' && (
        <TriangleAlert aria-label="Sync conflict" className="size-3 shrink-0 text-warning" />
      )}
      {task.external_source === 'm365' && (
        <span className="shrink-0 rounded bg-surface px-1 text-xs leading-4 text-secondary">
          M365
        </span>
      )}
      {task.assignees.length > 0 && <AvatarStack assignees={task.assignees} max={3} />}
      {task.due_at && (
        <span data-testid="task-event-due" className="shrink-0 text-secondary">
          {formatDueShort(task.due_at)}
        </span>
      )}
    </div>
  );
}
