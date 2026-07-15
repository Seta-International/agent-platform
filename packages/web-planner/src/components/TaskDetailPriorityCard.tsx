import type { TaskWithAssigneesRow } from '@seta/planner';
import {
  DEFAULT_PRIORITY,
  DisabledActionTooltip,
  DropdownMenu,
  PRIORITY_LEVELS,
  priorityFromNumber,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useUpdateTaskPriority } from '../hooks/mutations/update-task-priority';
import { PERMISSION_DENIED } from '../lib/permission-messages';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
}

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
        <DropdownMenu
          placement="below"
          menuWidth={180}
          button={{
            label: 'Priority',
            isDisabled: !canUpdate,
            children: (
              <>
                <span
                  className="inline-block size-2 rounded-sm"
                  style={{ background: current.color }}
                  aria-hidden
                />
                {current.label}
              </>
            ),
          }}
          items={PRIORITY_LEVELS.map((opt) => ({
            label: opt.label,
            icon: (
              <span
                className="inline-block size-2 rounded-sm"
                style={{ background: opt.color }}
                aria-hidden
              />
            ),
            onClick: () =>
              update.mutate({
                task_id: task.id,
                expected_version: task.version,
                priority_number: opt.value,
              }),
          }))}
        />
      </DisabledActionTooltip>
    </section>
  );
}
