import type { TaskWithAssigneesRow } from '@seta/planner';
import { Button, DisabledActionTooltip, RichTextDisplay, RichTextEditor } from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useUpdateTask } from '../hooks/mutations/update-task';
import { PERMISSION_DENIED } from '../lib/permission-messages';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
}

export function TaskDetailDescriptionCard({ task, planId }: Props) {
  const canUpdate = usePermission('planner.task.update');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.description ?? '');
  const update = useUpdateTask(planId);

  const beginEdit = () => {
    if (!canUpdate) return;
    setDraft(task.description ?? '');
    setEditing(true);
  };

  const save = () => {
    const doc = new DOMParser().parseFromString(draft, 'text/html');
    const textContent = (doc.body.textContent ?? '').trim();
    const next = !textContent ? null : draft;
    if (next === (task.description ?? null)) {
      setEditing(false);
      return;
    }
    update.mutate(
      { task_id: task.id, expected_version: task.version, patch: { description: next } },
      { onSuccess: () => setEditing(false) },
    );
  };

  const cancel = () => {
    setDraft(task.description ?? '');
    setEditing(false);
  };

  if (editing) {
    return (
      <section className="card" aria-label="Description">
        <header className="mb-2 text-base text-secondary">Description</header>
        <RichTextEditor value={draft} onChange={setDraft} onSave={save} onCancel={cancel} />
        <div className="mt-1 text-sm text-secondary">⌘↵ to save · Esc to cancel</div>
        <div className="mt-2 flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" label="Cancel" onClick={cancel} />
          <Button
            size="sm"
            variant="primary"
            label="Save"
            onClick={save}
            isDisabled={update.isPending}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="card" aria-label="Description">
      <header className="mb-2 text-base text-secondary">Description</header>
      <DisabledActionTooltip disabled={!canUpdate} reason={PERMISSION_DENIED.task.edit}>
        <button
          type="button"
          onClick={beginEdit}
          disabled={!canUpdate}
          aria-label="Edit description"
          className="group relative flex w-full items-start gap-2 rounded-md border border-border bg-body px-3 py-2 text-left transition-colors enabled:hover:border-border-strong enabled:hover:bg-card disabled:cursor-not-allowed"
        >
          <div className="max-h-[480px] min-h-[40px] flex-1 overflow-y-auto">
            {task.description ? (
              <div className="text-base leading-[1.55]">
                <RichTextDisplay value={task.description} />
              </div>
            ) : (
              <span className="text-base text-secondary">
                {canUpdate ? 'No description. Click to add.' : 'No description.'}
              </span>
            )}
          </div>
          {canUpdate && (
            <Pencil
              aria-hidden
              className="size-4 shrink-0 text-secondary opacity-0 transition-opacity group-hover:opacity-100"
            />
          )}
        </button>
      </DisabledActionTooltip>
    </section>
  );
}
