import type { TaskWithAssigneesRow } from '@seta/planner';
import {
  DEFAULT_PRIORITY,
  DisabledActionTooltip,
  PRIORITY_LEVELS,
  type PriorityNumber,
  priorityFromNumber,
  Selector,
  type SelectorOptionData,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useUpdateTaskPriority } from '../hooks/mutations/update-task-priority';
import { PERMISSION_DENIED } from '../lib/permission-messages';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
}

const PRIORITY_OPTIONS: SelectorOptionData[] = PRIORITY_LEVELS.map((opt) => ({
  value: String(opt.value),
  label: opt.label,
  icon: (
    <span
      className="inline-block size-2 rounded-sm"
      style={{ background: opt.color }}
      aria-hidden
    />
  ),
}));

export function TaskDetailPriorityCard({ task, planId }: Props) {
  const update = useUpdateTaskPriority(planId);
  const canUpdate = usePermission('planner.task.update');
  const current = priorityFromNumber(task.priority_number) ?? DEFAULT_PRIORITY;

  return (
    <section className="card" aria-label="Priority">
      <header className="mb-1.5">
        <span className="t-sm subtle">Priority</span>
      </header>
      <DisabledActionTooltip disabled={!canUpdate} reason={PERMISSION_DENIED.task.edit}>
        <Selector
          label="Priority"
          isLabelHidden
          options={PRIORITY_OPTIONS}
          value={String(current.value)}
          isDisabled={!canUpdate}
          onChange={(value) =>
            update.mutate({
              task_id: task.id,
              expected_version: task.version,
              priority_number: Number(value) as PriorityNumber,
            })
          }
        />
      </DisabledActionTooltip>
    </section>
  );
}
