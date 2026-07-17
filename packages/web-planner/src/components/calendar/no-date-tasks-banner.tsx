import type { TaskWithAssigneesRow } from '@seta/planner';
import { Button } from '@seta/shared-ui';
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
      className="mx-7 mb-2 rounded border border-warning bg-warning-muted"
      data-testid="no-date-banner"
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-base text-primary"
      >
        {expanded ? (
          <ChevronDown aria-hidden="true" className="size-3.5" />
        ) : (
          <ChevronRight aria-hidden="true" className="size-3.5" />
        )}
        <CalendarOff aria-hidden="true" className="size-3.5" />
        <span className="font-medium">Unscheduled tasks</span>
        <span className="rounded-full bg-card px-1.5 text-sm text-secondary">{tasks.length}</span>
      </button>
      {expanded && (
        <ul className="flex flex-wrap gap-1.5 px-3 pb-2">
          {tasks.map((t) => (
            <li key={t.id}>
              <Button
                size="sm"
                variant="secondary"
                label={t.title}
                onClick={() => onOpenTask(t.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
