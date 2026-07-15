import type { TaskDetailRow } from '@seta/planner';
import { classifyUrl, Input, ReferenceRow } from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useState } from 'react';
import { PlannerClientError } from '../api/planner-client';
import { useAddTaskReference } from '../hooks/mutations/add-task-reference';
import { useRemoveTaskReference } from '../hooks/mutations/remove-task-reference';
import { PERMISSION_DENIED } from '../lib/permission-messages';

interface Props {
  task: TaskDetailRow;
  planId: string;
}

function addErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof PlannerClientError && error.code === 'DUPLICATE_REFERENCE') {
    return 'This reference already exists on the task.';
  }
  return error instanceof Error ? error.message : 'Could not add the reference.';
}

export function TaskDetailReferencesCard({ task, planId }: Props) {
  const add = useAddTaskReference(planId);
  const remove = useRemoveTaskReference(planId);
  const canUpdate = usePermission('planner.task.update');
  const errorMessage = addErrorMessage(add.error);

  return (
    <section className="card" aria-label="References">
      <header className="t-sm subtle mb-2">References</header>
      <div className="flex flex-col gap-1.5">
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
            removeDisabled={!canUpdate}
            removeDisabledReason={PERMISSION_DENIED.task.edit}
          />
        ))}
      </div>
      <div className="mt-2.5">
        <ReferenceInput
          disabled={!canUpdate}
          onAdd={(c) =>
            add.mutate({
              task_id: task.id,
              url: c.url,
              alias: c.alias,
              type: c.type,
            })
          }
        />
        {errorMessage && (
          <p role="alert" className="mt-1.5 text-caption text-destructive">
            {errorMessage}
          </p>
        )}
      </div>
    </section>
  );
}

function ReferenceInput({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (c: NonNullable<ReturnType<typeof classifyUrl>>) => void;
}) {
  const [url, setUrl] = useState('');
  return (
    <Input
      label="Add reference URL"
      isLabelHidden
      value={url}
      onChange={(v) => setUrl(v)}
      placeholder="Paste a URL to attach a reference"
      isDisabled={disabled}
      onEnter={() => {
        const c = classifyUrl(url);
        if (!c) return;
        onAdd(c);
        setUrl('');
      }}
    />
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
