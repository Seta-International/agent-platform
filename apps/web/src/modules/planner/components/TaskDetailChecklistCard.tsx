import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import type { TaskDetailRow } from '@seta/planner';
import { Checkbox } from '@seta/shared-ui';
import { GripVertical, Plus } from 'lucide-react';
import { type KeyboardEvent, useRef, useState } from 'react';
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

  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const onSubmitDraft = () => {
    const label = draft.trim();
    if (!label) return;
    // Trello/Planner-style loop: clear the field and keep focus for the next item.
    add.mutate(
      { label },
      {
        onSuccess: () => {
          setDraft('');
          inputRef.current?.focus();
        },
      },
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmitDraft();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft('');
      inputRef.current?.blur();
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
      <header className="mb-2">
        <span className="t-sm subtle">
          Checklist · {task.checklist_summary.checked}/{task.checklist_summary.total}
        </span>
      </header>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId={`checklist-${task.id}`} type="CHECKLIST">
          {(dp) => (
            <div ref={dp.innerRef} {...dp.droppableProps} className="flex flex-col gap-1">
              {task.checklist.map((it, idx) => (
                <Draggable key={it.id} draggableId={it.id} index={idx}>
                  {(dpc) => (
                    <div
                      ref={dpc.innerRef}
                      {...dpc.draggableProps}
                      className="flex items-center gap-2 rounded-sm px-1 py-1.5"
                      style={dpc.draggableProps.style ?? undefined}
                    >
                      <button
                        type="button"
                        aria-label="Drag handle"
                        {...dpc.dragHandleProps}
                        className="inline-flex cursor-grab items-center border-none bg-transparent p-0 text-ink-tertiary"
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
                        className={`t-sm flex-1 cursor-pointer ${it.checked ? 'text-ink-subtle line-through' : 'text-ink'}`}
                      >
                        {it.label}
                      </label>
                      <button
                        type="button"
                        aria-label="Remove"
                        onClick={() => remove.mutate({ item_id: it.id })}
                        className="cursor-pointer border-none bg-transparent px-1 py-0 text-[14px] leading-none text-ink-subtle"
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

      <div className="mt-2 flex items-center gap-2 rounded-sm border border-hairline bg-surface-1 px-2 py-1.5 focus-within:border-primary">
        <Plus className="size-3.5 shrink-0 text-ink-tertiary" aria-hidden />
        <input
          ref={inputRef}
          aria-label="New checklist item"
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder="Add an item"
          className="flex-1 border-0 bg-transparent text-body-sm text-ink outline-none placeholder:text-ink-subtle"
        />
        <span className="t-xs subtle shrink-0" aria-hidden>
          ↵ to add
        </span>
      </div>
    </section>
  );
}
