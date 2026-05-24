import type { TaskWithAssigneesRow } from '@seta/planner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@seta/shared-ui';
import { ChevronDown } from 'lucide-react';
import { useUpdateTaskPreviewType } from '../hooks/mutations/update-task-preview-type';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
}

const PREVIEW_OPTIONS = [
  { value: 'automatic' as const, label: 'Automatic', desc: 'Best of below' },
  { value: 'noPreview' as const, label: 'None', desc: 'Title only' },
  { value: 'checklist' as const, label: 'Checklist', desc: 'First 3 items' },
  { value: 'description' as const, label: 'Description', desc: '2-line excerpt' },
  { value: 'reference' as const, label: 'Reference', desc: 'Top link host' },
];

// PREVIEW_OPTIONS index 0 ("Automatic") is always defined.
// biome-ignore lint/style/noNonNullAssertion: literal-indexed access on a constant.
const DEFAULT_PREVIEW = PREVIEW_OPTIONS[0]!;

export function TaskDetailPreviewTypeCard({ task, planId }: Props) {
  const update = useUpdateTaskPreviewType(planId);
  const current = PREVIEW_OPTIONS.find((o) => o.value === task.preview_type) ?? DEFAULT_PREVIEW;

  return (
    <section className="card" aria-label="Preview type">
      <header className="flex items-baseline justify-between mb-1.5">
        <span className="t-sm subtle">Preview</span>
        <span className="mono t-xs subtle">preview_type</span>
      </header>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-hairline bg-canvas px-3 py-2 text-body-sm text-ink hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus"
            aria-label="Preview type"
          >
            <span className="flex flex-col items-start">
              <span>{current.label}</span>
              <span className="text-caption text-ink-subtle">{current.desc}</span>
            </span>
            <ChevronDown className="size-3.5 text-ink-subtle" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[220px]">
          {PREVIEW_OPTIONS.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              onSelect={() =>
                update.mutate({
                  task_id: task.id,
                  expected_version: task.version,
                  preview_type: opt.value,
                })
              }
              className="flex flex-col items-start"
            >
              <span>{opt.label}</span>
              <span className="text-caption text-ink-subtle">{opt.desc}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </section>
  );
}
