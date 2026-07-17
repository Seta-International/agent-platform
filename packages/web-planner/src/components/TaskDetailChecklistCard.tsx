import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import type { ChecklistItemRow, TaskDetailRow } from '@seta/planner';
import { Checkbox, DisabledActionTooltip, IconButton, Input } from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { GripVertical, Plus, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useAddChecklistItem } from '../hooks/mutations/add-checklist-item';
import { useRemoveChecklistItem } from '../hooks/mutations/remove-checklist-item';
import { useUpdateChecklistItem } from '../hooks/mutations/update-checklist-item';
import { PERMISSION_DENIED } from '../lib/permission-messages';
import { computeReorderHint } from './checklist-reorder';

interface Props {
  task: TaskDetailRow;
  planId: string;
}

export function TaskDetailChecklistCard({ task, planId }: Props) {
  const add = useAddChecklistItem(planId, task.id);
  const update = useUpdateChecklistItem(planId, task.id);
  const remove = useRemoveChecklistItem(planId, task.id);
  const canUpdate = usePermission('planner.task.update');

  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingId]);

  const beginEdit = (it: ChecklistItemRow) => {
    if (!canUpdate) return;
    setEditingId(it.id);
    setEditDraft(it.label);
  };

  const commitEdit = (it: ChecklistItemRow) => {
    const next = editDraft.trim();
    if (next && next !== it.label) {
      update.mutate({ item_id: it.id, patch: { label: next } });
    }
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const onEditKeyDown = (e: KeyboardEvent<HTMLInputElement>, it: ChecklistItemRow) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit(it);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  const onSubmitDraft = () => {
    if (!canUpdate || add.isPending) return;
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
    if (!canUpdate) return;
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
                        {...(canUpdate ? dpc.dragHandleProps : {})}
                        disabled={!canUpdate}
                        className={`inline-flex items-center border-none bg-transparent p-0 text-disabled ${canUpdate ? 'cursor-grab' : 'cursor-not-allowed opacity-40'}`}
                      >
                        <GripVertical className="size-3.5" />
                      </button>
                      <Checkbox
                        label={it.label}
                        isLabelHidden
                        value={it.checked}
                        isDisabled={!canUpdate}
                        onChange={(v) =>
                          update.mutate({
                            item_id: it.id,
                            patch: { checked: v },
                          })
                        }
                      />
                      {editingId === it.id ? (
                        <Input
                          ref={editInputRef}
                          label="Edit checklist item"
                          isLabelHidden
                          value={editDraft}
                          onChange={(value) => setEditDraft(value)}
                          onKeyDown={(e) => onEditKeyDown(e, it)}
                          onBlur={() => commitEdit(it)}
                          // className would land on the inner control, not the
                          // Field that is the flex item; width sizes the field.
                          width="100%"
                        />
                      ) : (
                        <button
                          type="button"
                          disabled={!canUpdate}
                          onDoubleClick={() => beginEdit(it)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              beginEdit(it);
                            }
                          }}
                          title={canUpdate ? 'Double-click to edit' : undefined}
                          className={`t-sm flex-1 select-none border-none bg-transparent p-0 text-left ${canUpdate ? 'cursor-text' : 'cursor-default'} ${it.checked ? 'text-secondary line-through' : 'text-primary'}`}
                        >
                          {it.label}
                        </button>
                      )}
                      <DisabledActionTooltip
                        disabled={!canUpdate}
                        reason={PERMISSION_DENIED.task.edit}
                      >
                        <IconButton
                          variant="ghost"
                          size="sm"
                          label="Remove"
                          onClick={() => remove.mutate({ item_id: it.id })}
                          isDisabled={!canUpdate}
                          icon={<X className="size-3" />}
                        />
                      </DisabledActionTooltip>
                    </div>
                  )}
                </Draggable>
              ))}
              {dp.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <DisabledActionTooltip disabled={!canUpdate} reason={PERMISSION_DENIED.task.edit}>
        <div className="mt-2 flex items-center gap-2 rounded-sm border border-border bg-card px-2 py-1.5 focus-within:border-accent-bg">
          <Plus className="size-3.5 shrink-0 text-disabled" aria-hidden />
          <input
            ref={inputRef}
            aria-label="New checklist item"
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={onKeyDown}
            disabled={!canUpdate}
            placeholder="Add an item"
            className="flex-1 border-0 bg-transparent text-body-sm text-primary outline-none placeholder:text-secondary disabled:cursor-not-allowed"
          />
          <span className="t-xs subtle shrink-0" aria-hidden>
            ↵ to add
          </span>
        </div>
      </DisabledActionTooltip>
    </section>
  );
}
