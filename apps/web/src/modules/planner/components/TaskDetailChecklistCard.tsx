import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import type { TaskDetailRow } from '@seta/planner';
import { Button, Checkbox } from '@seta/shared-ui';
import { GripVertical, Plus } from 'lucide-react';
import { type CSSProperties, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useAddChecklistItem } from '../hooks/mutations/add-checklist-item';
import { useRemoveChecklistItem } from '../hooks/mutations/remove-checklist-item';
import { useUpdateChecklistItem } from '../hooks/mutations/update-checklist-item';
import { computeReorderHint } from './checklist-reorder';

interface Props {
  task: TaskDetailRow;
  planId: string;
}

export function TaskDetailChecklistCard({ task, planId }: Props) {
  const add = useAddChecklistItem(planId, task.id);
  const update = useUpdateChecklistItem(planId, task.id);
  const remove = useRemoveChecklistItem(planId, task.id);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const onSubmitDraft = () => {
    const label = draft.trim();
    if (!label) {
      setAdding(false);
      return;
    }
    add.mutate({ label }, { onSuccess: () => setDraft('') });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmitDraft();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setAdding(false);
      setDraft('');
    }
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const newHint = computeReorderHint(
      task.checklist,
      result.source.index,
      result.destination.index,
    );
    if (!newHint) return;
    const moved = task.checklist[result.source.index];
    if (!moved) return;
    update.mutate({ item_id: moved.id, patch: { order_hint: newHint } });
  };

  return (
    <section className="card" aria-label="Checklist">
      <header style={head}>
        <span className="t-sm subtle">
          Checklist · {task.checklist_summary.checked}/{task.checklist_summary.total}
        </span>
      </header>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId={`checklist-${task.id}`} type="CHECKLIST">
          {(dp) => (
            <div ref={dp.innerRef} {...dp.droppableProps} style={list}>
              {task.checklist.map((it, idx) => (
                <Draggable key={it.id} draggableId={it.id} index={idx}>
                  {(dpc) => (
                    <div
                      ref={dpc.innerRef}
                      {...dpc.draggableProps}
                      style={{ ...itemRow, ...(dpc.draggableProps.style ?? {}) }}
                    >
                      <button
                        type="button"
                        aria-label="Drag handle"
                        {...dpc.dragHandleProps}
                        style={handle}
                      >
                        <GripVertical className="size-3.5" />
                      </button>
                      <Checkbox
                        id={`chk-${it.id}`}
                        aria-label={it.label}
                        checked={it.checked}
                        onCheckedChange={(v) =>
                          update.mutate({
                            item_id: it.id,
                            patch: { checked: v === true },
                          })
                        }
                      />
                      <label
                        htmlFor={`chk-${it.id}`}
                        className="t-sm"
                        style={{
                          flex: 1,
                          textDecoration: it.checked ? 'line-through' : 'none',
                          color: it.checked ? 'var(--color-ink-subtle)' : 'var(--color-ink)',
                          cursor: 'pointer',
                        }}
                      >
                        {it.label}
                      </label>
                      <button
                        type="button"
                        aria-label="Remove"
                        onClick={() => remove.mutate({ item_id: it.id })}
                        style={removeBtn}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {dp.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {adding ? (
        <div style={addRow}>
          <input
            ref={inputRef}
            aria-label="New checklist item"
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={onKeyDown}
            placeholder="New step"
            style={input}
          />
        </div>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
          <Plus className="size-3" />
          Add item
        </Button>
      )}
    </section>
  );
}

const head: CSSProperties = { marginBottom: 8 };
const list: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
const itemRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 4px',
  borderRadius: 4,
};
const handle: CSSProperties = {
  cursor: 'grab',
  background: 'transparent',
  border: 'none',
  color: 'var(--color-ink-tertiary)',
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
};
const removeBtn: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--color-ink-subtle)',
  cursor: 'pointer',
  padding: '0 4px',
  fontSize: 14,
  lineHeight: 1,
};
const addRow: CSSProperties = {
  marginTop: 8,
};
const input: CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: 4,
  border: '1px solid var(--color-hairline)',
  background: 'var(--color-surface-1)',
  color: 'var(--color-ink)',
  fontSize: 13,
};
