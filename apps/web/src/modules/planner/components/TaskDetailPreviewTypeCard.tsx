import type { TaskWithAssigneesRow } from '@seta/planner';
import { PreviewTypeRadio } from '@seta/shared-ui';
import { useUpdateTaskPreviewType } from '../hooks/mutations/update-task-preview-type';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
}

export function TaskDetailPreviewTypeCard({ task, planId }: Props) {
  const update = useUpdateTaskPreviewType(planId);
  return (
    <section className="card" aria-label="Preview type">
      <header style={head}>
        <span className="t-sm subtle">Preview</span>
        <span className="mono t-xs subtle">preview_type</span>
      </header>
      <PreviewTypeRadio
        value={task.preview_type}
        onChange={(preview_type) =>
          update.mutate({
            task_id: task.id,
            expected_version: task.version,
            preview_type,
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
