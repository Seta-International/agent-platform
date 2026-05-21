import type { TaskDetailRow } from '@seta/planner';
import { AddReferenceCombobox, ReferenceRow } from '@seta/shared-ui';
import { useAddTaskReference } from '../hooks/mutations/add-task-reference';
import { useRemoveTaskReference } from '../hooks/mutations/remove-task-reference';

interface Props {
  task: TaskDetailRow;
  planId: string;
}

export function TaskDetailReferencesCard({ task, planId }: Props) {
  const add = useAddTaskReference(planId);
  const remove = useRemoveTaskReference(planId);

  return (
    <section className="card" aria-label="References">
      <header className="t-sm subtle" style={{ marginBottom: 8 }}>
        References
      </header>
      <div style={list}>
        {task.references.map((r) => (
          <ReferenceRow
            key={r.id}
            refRow={{
              id: r.id,
              url: r.url,
              alias: r.alias,
              host: hostOf(r.url),
              type: r.type,
            }}
            onOpen={(row) => window.open(row.url, '_blank', 'noopener,noreferrer')}
            onRemove={(row) => remove.mutate({ task_id: task.id, url: row.url })}
          />
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <AddReferenceCombobox
          onAdd={(classified) =>
            add.mutate({
              task_id: task.id,
              url: classified.url,
              alias: classified.alias,
              type: classified.type,
            })
          }
        />
      </div>
    </section>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const list = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 6,
};
