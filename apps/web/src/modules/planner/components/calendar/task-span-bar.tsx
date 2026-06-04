import { AvatarStack, cn } from '@seta/shared-ui';
import { TriangleAlert } from 'lucide-react';
import type { TaskSpan } from '../../lib/calendar-lanes';
import { formatDueShort } from '../../lib/format-due-short';
import { priorityLabel } from '../../state/task-derived';

/** Priority stripe colours — same tokens the board chips/dots use (DESIGN.md). */
const PRIORITY_STRIPE: Record<ReturnType<typeof priorityLabel>, string> = {
  urgent: 'var(--color-priority-urgent)',
  important: 'var(--color-priority-important)',
  medium: 'var(--color-priority-medium)',
  low: 'var(--color-priority-low)',
};

interface Props {
  span: TaskSpan;
  onOpenTask: (taskId: string) => void;
}

export function TaskSpanBar({ span, onOpenTask }: Props) {
  const { task } = span;
  // Only the terminal segment (the one that actually ends) shows the due date.
  const showDue = !span.clippedEnd && task.due_at !== null;
  return (
    <button
      type="button"
      data-testid={`task-span-${task.id}`}
      title={task.title}
      onClick={() => onOpenTask(task.id)}
      style={{
        gridColumn: `${span.startCol} / span ${span.span}`,
        gridRow: `${span.lane + 1}`,
        borderLeftColor: PRIORITY_STRIPE[priorityLabel(task.priority_number)],
      }}
      className={cn(
        'pointer-events-auto mx-0.5 flex min-w-0 items-center gap-1.5 border-l-4 bg-surface-1 px-1.5 text-left text-caption text-ink shadow-sm hover:bg-surface-2',
        span.clippedStart ? 'rounded-l-none' : 'rounded-l',
        span.clippedEnd ? 'rounded-r-none' : 'rounded-r',
      )}
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
      {showDue && task.due_at && (
        <span data-testid="task-span-due" className="shrink-0 text-ink-muted">
          {formatDueShort(task.due_at)}
        </span>
      )}
    </button>
  );
}
