import type { TaskWithAssigneesRow } from '@seta/planner';
import {
  DEFAULT_PRIORITY,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PRIORITY_LEVELS,
  priorityFromNumber,
} from '@seta/shared-ui';
import { ChevronDown } from 'lucide-react';
import { useUpdateTaskPriority } from '../hooks/mutations/update-task-priority';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
}

export function TaskDetailPriorityCard({ task, planId }: Props) {
  const update = useUpdateTaskPriority(planId);
  const current = priorityFromNumber(task.priority_number) ?? DEFAULT_PRIORITY;

  return (
    <section className="card" aria-label="Priority">
      <header className="mb-1.5">
        <span className="t-sm subtle">Priority</span>
      </header>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-hairline bg-canvas px-3 py-2 text-body-sm text-ink hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus"
            aria-label="Priority"
          >
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-block size-2 rounded-sm"
                style={{ background: current.color }}
                aria-hidden
              />
              {current.label}
            </span>
            <ChevronDown className="size-3.5 text-ink-subtle" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px]">
          {PRIORITY_LEVELS.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              onSelect={() =>
                update.mutate({
                  task_id: task.id,
                  expected_version: task.version,
                  priority_number: opt.value,
                })
              }
              className="flex items-center gap-2"
            >
              <span
                className="inline-block size-2 rounded-sm"
                style={{ background: opt.color }}
                aria-hidden
              />
              {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </section>
  );
}
