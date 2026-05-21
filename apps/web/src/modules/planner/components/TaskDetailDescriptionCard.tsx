import type { TaskWithAssigneesRow } from '@seta/planner';
import { Button } from '@seta/shared-ui';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useUpdateTask } from '../hooks/mutations/update-task';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
}

export function TaskDetailDescriptionCard({ task, planId }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.description ?? '');
  const update = useUpdateTask(planId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const beginEdit = () => {
    setDraft(task.description ?? '');
    setEditing(true);
  };

  const save = () => {
    const next = draft.trim() === '' ? null : draft;
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

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
  };

  if (editing) {
    return (
      <section className="card" aria-label="Description">
        <header className="t-sm subtle" style={{ marginBottom: 8 }}>
          Description
        </header>
        <textarea
          ref={textareaRef}
          aria-label="Description"
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          rows={8}
          style={textarea}
        />
        <div className="t-xs subtle" style={{ marginTop: 4 }}>
          ⌘↵ to save · Esc to cancel
        </div>
        <div style={btnRow}>
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
      <header className="t-sm subtle" style={{ marginBottom: 8 }}>
        Description
      </header>
      <button type="button" onClick={beginEdit} aria-label="Edit description" style={viewBtn}>
        {task.description ? (
          <div className="t-sm" style={{ lineHeight: 1.55, textAlign: 'left' }}>
            <ReactMarkdown>{task.description}</ReactMarkdown>
          </div>
        ) : (
          <span className="t-sm subtle">No description. Click to add.</span>
        )}
      </button>
    </section>
  );
}

const textarea = {
  width: '100%',
  minHeight: 140,
  padding: 10,
  borderRadius: 6,
  border: '1px solid var(--color-hairline)',
  background: 'var(--color-surface-1)',
  color: 'var(--color-ink)',
  fontFamily: 'inherit',
  fontSize: 13,
  resize: 'vertical' as const,
};
const btnRow = {
  display: 'flex',
  gap: 6,
  marginTop: 8,
  justifyContent: 'flex-end',
};
const viewBtn = {
  display: 'block',
  width: '100%',
  textAlign: 'left' as const,
  background: 'transparent',
  border: 'none',
  padding: 0,
  cursor: 'text',
  color: 'inherit',
};
