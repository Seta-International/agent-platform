import type { TaskWithAssigneesRow } from '@seta/planner';
import { PrioritySegmented } from '@seta/shared-ui';
import { useUpdateTaskPriority } from '../hooks/mutations/update-task-priority';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
}

export function TaskDetailPriorityCard({ task, planId }: Props) {
  const update = useUpdateTaskPriority(planId);
  return (
    <section className="card" aria-label="Priority">
      <header style={head}>
        <span className="t-sm subtle">Priority</span>
        <span className="mono t-xs subtle">priority_number</span>
      </header>
      <PrioritySegmented
        value={task.priority_number}
        onChange={(priority_number) =>
          update.mutate({
            task_id: task.id,
            expected_version: task.version,
            priority_number,
          })
        }
      />
    </section>
  );
}

const head = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: 6,
};
