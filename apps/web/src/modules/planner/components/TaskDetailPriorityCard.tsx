import type { TaskWithAssigneesRow } from '@seta/planner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@seta/shared-ui';
import { ChevronDown } from 'lucide-react';
import { useUpdateTaskPriority } from '../hooks/mutations/update-task-priority';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
}

const PRIORITY_OPTIONS = [
  { value: 1 as const, label: 'Urgent', dotClass: 'bg-semantic-danger' },
  { value: 3 as const, label: 'Important', dotClass: 'bg-semantic-warning' },
  { value: 5 as const, label: 'Medium', dotClass: 'bg-semantic-info' },
  { value: 9 as const, label: 'Low', dotClass: 'bg-ink-tertiary' },
] satisfies ReadonlyArray<{ value: 1 | 3 | 5 | 9; label: string; dotClass: string }>;

// PRIORITY_OPTIONS has 4 fixed entries; index 2 ("Medium") is always defined.
// biome-ignore lint/style/noNonNullAssertion: literal-indexed access on a constant.
const DEFAULT_PRIORITY = PRIORITY_OPTIONS[2]!;

export function TaskDetailPriorityCard({ task, planId }: Props) {
  const update = useUpdateTaskPriority(planId);
  const current =
    PRIORITY_OPTIONS.find((o) => o.value === task.priority_number) ?? DEFAULT_PRIORITY;

  return (
    <section className="card" aria-label="Priority">
      <header className="flex items-baseline justify-between mb-1.5">
        <span className="t-sm subtle">Priority</span>
        <span className="mono t-xs subtle">priority_number</span>
      </header>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-hairline bg-canvas px-3 py-2 text-body-sm text-ink hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus"
            aria-label="Priority"
          >
            <span className="inline-flex items-center gap-2">
              <span className={`inline-block size-2 rounded-sm ${current.dotClass}`} aria-hidden />
              {current.label}
            </span>
            <ChevronDown className="size-3.5 text-ink-subtle" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px]">
          {PRIORITY_OPTIONS.map((opt) => (
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
              <span className={`inline-block size-2 rounded-sm ${opt.dotClass}`} aria-hidden />
              {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </section>
  );
}
