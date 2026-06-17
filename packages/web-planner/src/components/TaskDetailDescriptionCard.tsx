import type { TaskWithAssigneesRow } from '@seta/planner';
import { Button, RichTextDisplay, RichTextEditor } from '@seta/shared-ui';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useUpdateTask } from '../hooks/mutations/update-task';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
}

export function TaskDetailDescriptionCard({ task, planId }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.description ?? '');
  const update = useUpdateTask(planId);

  const beginEdit = () => {
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
        <header className="mb-2 text-body-sm text-ink-subtle">Description</header>
        <RichTextEditor value={draft} onChange={setDraft} onSave={save} onCancel={cancel} />
        <div className="mt-1 text-caption text-ink-subtle">⌘↵ to save · Esc to cancel</div>
        <div className="mt-2 flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={update.isPending}>
            Save
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="card" aria-label="Description">
      <header className="mb-2 text-body-sm text-ink-subtle">Description</header>
      <button
        type="button"
        onClick={beginEdit}
        aria-label="Edit description"
        className="group relative flex w-full items-start gap-2 rounded-md border border-hairline bg-canvas px-3 py-2 text-left transition-colors hover:border-hairline-strong hover:bg-surface-1"
      >
        <div className="min-h-[40px] flex-1">
          {task.description ? (
            <div className="text-body-sm leading-[1.55]">
              <RichTextDisplay value={task.description} />
            </div>
          ) : (
            <span className="text-body-sm text-ink-subtle">No description. Click to add.</span>
          )}
        </div>
        <Pencil
          aria-hidden
          className="size-4 shrink-0 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100"
        />
      </button>
    </section>
  );
}
