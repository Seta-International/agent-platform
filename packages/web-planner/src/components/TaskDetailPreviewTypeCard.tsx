import type { TaskWithAssigneesRow } from '@seta/planner';
import { DisabledActionTooltip, DropdownMenu, DropdownMenuItem } from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useUpdateTaskPreviewType } from '../hooks/mutations/update-task-preview-type';
import { PERMISSION_DENIED } from '../lib/permission-messages';

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
  const canUpdate = usePermission('planner.task.update');
  const current = PREVIEW_OPTIONS.find((o) => o.value === task.preview_type) ?? DEFAULT_PREVIEW;

  return (
    <section className="card" aria-label="Show on card">
      <header className="mb-1.5">
        <span className="t-sm subtle">Show on card</span>
      </header>
      <DisabledActionTooltip disabled={!canUpdate} reason={PERMISSION_DENIED.task.edit}>
        <DropdownMenu
          placement="below"
          menuWidth={220}
          button={{
            label: 'Preview type',
            isDisabled: !canUpdate,
            children: (
              <span className="flex flex-col items-start">
                <span>{current.label}</span>
                <span className="text-caption text-ink-subtle">{current.desc}</span>
              </span>
            ),
          }}
        >
          {PREVIEW_OPTIONS.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              label={opt.label}
              description={opt.desc}
              onClick={() =>
                update.mutate({
                  task_id: task.id,
                  expected_version: task.version,
                  preview_type: opt.value,
                })
              }
            />
          ))}
        </DropdownMenu>
      </DisabledActionTooltip>
    </section>
  );
}
