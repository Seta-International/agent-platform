import type { TaskWithAssigneesRow } from '@seta/planner';
import { cn } from '@seta/shared-ui';
import { CalendarOff, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface Props {
  tasks: TaskWithAssigneesRow[];
  onOpenTask: (taskId: string) => void;
}

export function NoDateTasksBanner({ tasks, onOpenTask }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (tasks.length === 0) return null;

  return (
    <div
      className="mx-7 mb-2 rounded border border-semantic-warning bg-semantic-warning-tint"
      data-testid="no-date-banner"
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-body-sm text-ink"
      >
        {expanded ? (
          <ChevronDown aria-hidden="true" className="size-3.5" />
        ) : (
          <ChevronRight aria-hidden="true" className="size-3.5" />
        )}
        <CalendarOff aria-hidden="true" className="size-3.5" />
        <span className="font-medium">Unscheduled tasks</span>
        <span className="rounded-full bg-surface-1 px-1.5 text-caption text-ink-muted">
          {tasks.length}
        </span>
      </button>
      {expanded && (
        <ul className="flex flex-wrap gap-1.5 px-3 pb-2">
          {tasks.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onOpenTask(t.id)}
                className={cn(
                  'max-w-64 truncate rounded-full border border-hairline bg-surface-1 px-2.5 py-0.5',
                  'text-caption text-ink hover:bg-surface-2',
                )}
              >
                {t.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
