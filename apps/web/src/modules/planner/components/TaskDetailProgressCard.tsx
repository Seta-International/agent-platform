import type { TaskWithAssigneesRow } from '@seta/planner';
import { ProgressSlider, Switch } from '@seta/shared-ui';
import { useUpdateTaskProgress } from '../hooks/mutations/update-task-progress';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
}

export function TaskDetailProgressCard({ task, planId }: Props) {
  const update = useUpdateTaskProgress(planId);

  return (
    <section className="card" aria-label="Progress">
      <header style={head}>
        <span className="t-sm subtle">Progress</span>
        <span className="mono t-xs subtle">percent_complete</span>
      </header>
      <ProgressSlider
        value={task.percent_complete}
        onChange={(percent_complete) =>
          update.mutate({
            task_id: task.id,
            expected_version: task.version,
            percent_complete,
          })
        }
        disabled={task.is_deferred}
      />
      <div style={deferredRow}>
        <Switch
          id={`deferred-${task.id}`}
          aria-label="Deferred"
          checked={task.is_deferred}
          onCheckedChange={(is_deferred) =>
            update.mutate({
              task_id: task.id,
              expected_version: task.version,
              is_deferred,
            })
          }
        />
        <label htmlFor={`deferred-${task.id}`} className="t-xs subtle">
          Deferred
        </label>
      </div>
    </section>
  );
}

const head = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: 6,
};
const deferredRow = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 10,
};
