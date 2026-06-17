import type { TaskWithAssigneesRow } from '@seta/planner';
import { AvatarStack, cn } from '@seta/shared-ui';
import { TriangleAlert } from 'lucide-react';
import { formatDueShort } from '../../lib/format-due-short';
import { priorityLabel } from '../../state/task-derived';

const PRIORITY_STRIPE: Record<ReturnType<typeof priorityLabel>, string> = {
  urgent: 'var(--color-priority-urgent)',
  important: 'var(--color-priority-important)',
  medium: 'var(--color-priority-medium)',
  low: 'var(--color-priority-low)',
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
        'flex min-w-0 w-full items-center gap-1.5 border-l-4 bg-surface-1 px-1.5',
        'text-caption text-ink shadow-sm cursor-pointer hover:bg-surface-2',
      )}
      style={{ borderLeftColor: PRIORITY_STRIPE[priorityLabel(task.priority_number)] }}
    >
      <span className="min-w-0 flex-1 truncate">{task.title}</span>
      {task.sync_status === 'conflict' && (
        <TriangleAlert
          aria-label="Sync conflict"
          className="size-3 shrink-0 text-semantic-warning"
        />
      )}
      {task.external_source === 'm365' && (
        <span className="shrink-0 rounded bg-surface-2 px-1 text-[10px] leading-4 text-ink-subtle">
          M365
        </span>
      )}
      {task.assignees.length > 0 && <AvatarStack assignees={task.assignees} max={3} />}
      {task.due_at && (
        <span data-testid="task-event-due" className="shrink-0 text-ink-muted">
          {formatDueShort(task.due_at)}
        </span>
      )}
    </div>
  );
}
