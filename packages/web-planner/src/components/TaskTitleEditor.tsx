import type { TaskWithAssigneesRow } from '@seta/planner';
import { Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useUpdateTask } from '../hooks/mutations/update-task';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
}

/**
 * Large inline-editable task title rendered at the top of the detail body.
 * Visible affordances (hover bg + pencil) avoid the "is this editable?"
 * problem inline editors run into. Saves on blur or Enter; reverts on Escape.
 */
export function TaskTitleEditor({ task, planId }: Props) {
  const update = useUpdateTask(planId);
  const [draft, setDraft] = useState(task.title);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external updates (e.g. SSE) when we're not the source of the edit.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(task.title);
    }
  }, [task.title]);

  function commit() {
    const next = draft.trim();
    if (!next) {
      setDraft(task.title);
      return;
    }
    if (next === task.title) return;
    update.mutate({
      task_id: task.id,
      expected_version: task.version,
      patch: { title: next },
    });
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: wrapper just forwards clicks to the inner input which already handles focus.
    // biome-ignore lint/a11y/useKeyWithClickEvents: the input child is the actual focus target; wrapper has no own keyboard activation.
    <div
      className={[
        'group relative flex items-center gap-2 rounded-md border bg-canvas px-3 py-2 transition-colors',
        focused
          ? 'border-primary shadow-[0_0_0_3px_var(--color-primary-tint)]'
          : 'border-hairline hover:border-hairline-strong hover:bg-surface-1',
      ].join(' ')}
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        type="text"
        aria-label="Task title"
        placeholder="Task title — what needs to happen?"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'Escape') {
            setDraft(task.title);
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        className="flex-1 border-0 bg-transparent text-[20px] font-semibold leading-tight tracking-tight text-ink outline-none placeholder:text-ink-tertiary"
      />
      {!focused && (
        <Pencil
          aria-hidden
          className="size-4 shrink-0 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100"
        />
      )}
    </div>
  );
}
