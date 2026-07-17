import type { TaskPreviewType, TaskWithAssigneesRow } from '@seta/planner';
import { DisabledActionTooltip, Selector, type SelectorOptionData } from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useUpdateTaskPreviewType } from '../hooks/mutations/update-task-preview-type';
import { PERMISSION_DENIED } from '../lib/permission-messages';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
}

// Astryx Selector options carry a single label, so the old two-line
// label + hint is folded into one line with a middot separator.
const PREVIEW_OPTIONS: SelectorOptionData[] = [
  { value: 'automatic', label: 'Automatic · Best of below' },
  { value: 'noPreview', label: 'None · Title only' },
  { value: 'checklist', label: 'Checklist · First 3 items' },
  { value: 'description', label: 'Description · 2-line excerpt' },
  { value: 'reference', label: 'Reference · Top link host' },
];

export function TaskDetailPreviewTypeCard({ task, planId }: Props) {
  const update = useUpdateTaskPreviewType(planId);
  const canUpdate = usePermission('planner.task.update');

  return (
    <section className="card" aria-label="Show on card">
      <header className="mb-1.5">
        <span className="text-sm text-secondary">Show on card</span>
      </header>
      <DisabledActionTooltip disabled={!canUpdate} reason={PERMISSION_DENIED.task.edit}>
        <Selector
          label="Show on card"
          isLabelHidden
          options={PREVIEW_OPTIONS}
          value={task.preview_type ?? 'automatic'}
          isDisabled={!canUpdate}
          onChange={(value) =>
            update.mutate({
              task_id: task.id,
              expected_version: task.version,
              preview_type: value as TaskPreviewType,
            })
          }
        />
      </DisabledActionTooltip>
    </section>
  );
}
