import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import type { BucketRow, PlanRow, TaskWithAssigneesRow } from '@seta/planner';
import {
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
  PreviewBody,
  type PreviewBodyTask,
} from '@seta/shared-ui';
import { type HTMLAttributes, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDeleteBucketDialog } from '../components/ConfirmDeleteBucketDialog';
import { type BucketCard, VirtualizedBucketList } from '../components/virtualized-bucket-list';
import { useCreateBucket } from '../hooks/mutations/create-bucket';
import { useCreateTask } from '../hooks/mutations/create-task';
import { useDeleteBucket } from '../hooks/mutations/delete-bucket';
import { useMoveBucket } from '../hooks/mutations/move-bucket';
import { useMoveTask } from '../hooks/mutations/move-task';
import { useUpdateBucket } from '../hooks/mutations/update-bucket';
import { useBoardKeyboard } from '../hooks/use-board-keyboard';
import { formatDueShort } from '../lib/format-due-short';
import { computeNextFocus } from '../state/compute-next-focus';
import { computeTaskMove } from '../state/compute-task-move';
import { useRecentlyMovedTasks } from '../state/recently-moved-tasks';
import { useSavingIds } from '../state/saving-ids';
import { compareOrderHint, priorityLabel } from '../state/task-derived';
import type { BoardFilters } from '../state/url-state';

interface Props {
  plan: PlanRow;
  buckets: BucketRow[];
  tasks: TaskWithAssigneesRow[];
  filters: BoardFilters;
  onFiltersChange: (f: BoardFilters) => void;
  onOpenTask: (taskId: string) => void;
  q?: string;
  onQChange?: (next: string) => void;
}

const NO_BUCKET_DROPPABLE_ID = '__no_bucket__';

function statusForBucketName(name: string): 'muted' | 'primary' | 'warning' | 'success' {
  const n = name.toLowerCase();
  if (n.includes('progress')) return 'primary';
  if (n.includes('review')) return 'warning';
  if (n.includes('done')) return 'success';
  return 'muted';
}

export function PlanPage({
  plan,
  buckets,
  tasks,
  filters,
  onFiltersChange,
  onOpenTask,
  q = '',
  onQChange,
}: Props) {
  const planId = plan.id;
  const moveTask = useMoveTask(planId);
  const moveBucket = useMoveBucket(planId);
  const createTask = useCreateTask(planId);
  const createBucket = useCreateBucket(planId);
  const deleteBucket = useDeleteBucket(planId);
  const updateBucket = useUpdateBucket(planId);
  const savingIds = useSavingIds((s) => s.ids);
  const recentlyMoved = useRecentlyMovedTasks((s) => s.ids);

  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [pendingDeleteBucket, setPendingDeleteBucket] = useState<{
    id: string;
    name: string;
    count: number;
    version: number;
  } | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

  const { activeByBucket, completedByBucket } = useMemo(() => {
    const active = new Map<string | null, BucketCard[]>();
    const completed = new Map<string | null, BucketCard[]>();
    const sourceById = new Map(tasks.map((t) => [t.id, t]));
    const assigneeIdSet = new Set(filters.assignee_ids);
    const labelIdSet = new Set(filters.label_ids);

    for (const t of tasks) {
      if (filters.assignee_ids.length && !t.assignees.some((a) => assigneeIdSet.has(a.user_id))) {
        continue;
      }
      if (filters.label_ids.length && !t.labels.some((l) => labelIdSet.has(l.id))) {
        continue;
      }
      if (q && !t.title.toLowerCase().includes(q.toLowerCase())) {
        continue;
      }

      const priority = priorityLabel(t.priority_number);
      const card = {
        id: t.id,
        title: t.title,
        priority,
        start_label: t.start_at ? formatDueShort(t.start_at) : undefined,
        due_label: t.due_at ? formatDueShort(t.due_at) : undefined,
        label: t.labels[0] ? { name: t.labels[0].name, color: t.labels[0].color } : undefined,
        assignees: t.assignees.map((a) => ({
          user_id: a.user_id,
          display_name: a.display_name,
        })),
        saving: savingIds.has(t.id),
        recentlyMoved: recentlyMoved.has(t.id),
        external_source: t.external_source,
        sync_status: t.sync_status,
        external_synced_at: t.external_synced_at,
        checklist_summary: t.checklist_summary,
      };
      const previewTask: PreviewBodyTask = {
        description: t.description ?? undefined,
        checklist: t.checklist_preview.map((c) => ({
          id: c.id,
          text: c.label,
          done: c.checked,
        })),
        references: t.reference_preview.map((r) => ({
          id: r.id,
          type: r.type,
          alias: r.alias,
          host: r.host,
        })),
      };
      const previewSlot: ReactNode = (
        <PreviewBody task={previewTask} variant={t.preview_type ?? 'automatic'} />
      );

      if (t.percent_complete === 100) {
        const arr = completed.get(t.bucket_id) ?? [];
        arr.push({ card: { ...card, isCompleted: true }, previewSlot });
        completed.set(t.bucket_id, arr);
      } else {
        const arr = active.get(t.bucket_id) ?? [];
        arr.push({ card, previewSlot });
        active.set(t.bucket_id, arr);
      }
    }

    for (const [, arr] of active) {
      arr.sort((a, b) => {
        const ta = sourceById.get(a.card.id);
        const tb = sourceById.get(b.card.id);
        return compareOrderHint(ta?.order_hint ?? null, tb?.order_hint ?? null);
      });
    }
    for (const [, arr] of completed) {
      arr.sort((a, b) => {
        const ta = sourceById.get(a.card.id);
        const tb = sourceById.get(b.card.id);
        return compareOrderHint(ta?.order_hint ?? null, tb?.order_hint ?? null);
      });
    }

    return { activeByBucket: active, completedByBucket: completed };
  }, [tasks, filters, savingIds, recentlyMoved, q]);

  // Build a flat bucket structure for computeNextFocus. Derived from buckets so
  // the order matches the rendered columns.
  const structure = useMemo(
    () => ({
      buckets: buckets.map((b) => ({
        id: b.id,
        cardIds: (activeByBucket.get(b.id) ?? []).map((e) => e.card.id),
      })),
    }),
    [buckets, activeByBucket],
  );

  useEffect(() => {
    if (focusedCardId) cardRefs.current.get(focusedCardId)?.focus();
  }, [focusedCardId]);

  useBoardKeyboard({
    onMoveFocus: (dir) => setFocusedCardId((prev) => computeNextFocus(prev, dir, structure)),
    onOpenFocused: () => {
      if (focusedCardId) onOpenTask(focusedCardId);
    },
    onCreateTask: () => {
      const bucketId = focusedCardId
        ? buckets.find((b) =>
            (activeByBucket.get(b.id) ?? []).some((e) => e.card.id === focusedCardId),
          )?.id
        : buckets[0]?.id;
      if (bucketId) createTask.mutate({ plan_id: plan.id, bucket_id: bucketId, title: 'New task' });
    },
  });

  const hasActiveFilters =
    filters.assignee_ids.length > 0 || filters.label_ids.length > 0 || q.length > 0;
  const totalVisible =
    Array.from(activeByBucket.values()).reduce((acc, l) => acc + l.length, 0) +
    Array.from(completedByBucket.values()).reduce((acc, l) => acc + l.length, 0);

  function onDragEnd(r: DropResult) {
    if (!r.destination) return;
    if (
      r.source.droppableId === r.destination.droppableId &&
      r.source.index === r.destination.index
    ) {
      return;
    }

    if (r.type === 'COLUMN') {
      const others = buckets.filter((b) => b.id !== r.draggableId);
      const beforeNeighbour = others[r.destination.index];
      const afterNeighbour =
        r.destination.index === 0 ? undefined : others[r.destination.index - 1];
      const bucket = buckets.find((b) => b.id === r.draggableId);
      if (!bucket) return;
      moveBucket.mutate({
        plan_id: plan.id,
        bucket_id: bucket.id,
        before_id: beforeNeighbour?.id,
        after_id: beforeNeighbour ? undefined : afterNeighbour?.id,
      });
      return;
    }

    const targetBucketId =
      r.destination.droppableId === NO_BUCKET_DROPPABLE_ID ? null : r.destination.droppableId;
    const inTarget = (activeByBucket.get(targetBucketId) ?? [])
      .filter((e) => e.card.id !== r.draggableId)
      .map((e) => ({ id: e.card.id }));
    const task = tasks.find((t) => t.id === r.draggableId);
    if (!task) return;
    const move = computeTaskMove({
      draggableId: r.draggableId,
      destinationIndex: r.destination.index,
      destinationBucketId: targetBucketId,
      inTarget,
    });
    moveTask.mutate({
      task_id: task.id,
      expected_version: task.version,
      bucket_id: move.bucket_id,
      before_id: move.before_id,
      after_id: move.after_id,
    });
  }

  return (
    <>
      {hasActiveFilters && totalVisible === 0 && (
        <div role="status" className="plan-no-results">
          <p>No tasks match what you&apos;re filtering for.</p>
          <button
            type="button"
            onClick={() => {
              onFiltersChange({ assignee_ids: [], label_ids: [] });
              onQChange?.('');
            }}
          >
            Clear filters
          </button>
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="board" type="COLUMN" direction="horizontal">
          {(provided) => (
            <KanbanBoard
              onAddBucket={(name) =>
                createBucket.mutate({
                  name,
                  after_bucket_id: buckets[buckets.length - 1]?.id,
                })
              }
              rootDroppable={{
                ref: provided.innerRef,
                // Why: @hello-pangea/dnd uses string-indexed data-rfd-* keys that don't satisfy React's HTMLAttributes shape.
                rootProps: provided.droppableProps as unknown as HTMLAttributes<HTMLElement>,
                placeholder: provided.placeholder,
              }}
            >
              {buckets.map((b, idx) => (
                <Draggable key={b.id} draggableId={b.id} index={idx}>
                  {(dp, ds) => (
                    <KanbanColumn
                      name={b.name}
                      count={(activeByBucket.get(b.id) ?? []).length}
                      status={statusForBucketName(b.name)}
                      onCreateTask={(input) =>
                        createTask.mutate({ plan_id: plan.id, bucket_id: b.id, ...input })
                      }
                      onRename={(newName) =>
                        updateBucket.mutate({
                          bucket_id: b.id,
                          expected_version: b.version,
                          patch: { name: newName },
                        })
                      }
                      onDelete={() => {
                        const count =
                          (activeByBucket.get(b.id) ?? []).length +
                          (completedByBucket.get(b.id) ?? []).length;
                        if (count > 0) {
                          setPendingDeleteBucket({
                            id: b.id,
                            name: b.name,
                            count,
                            version: b.version,
                          });
                        } else {
                          deleteBucket.mutate({ bucket_id: b.id, expected_version: b.version });
                        }
                      }}
                      draggableHandle={{
                        ref: dp.innerRef,
                        rootProps: dp.draggableProps,
                        handleProps: dp.dragHandleProps ?? undefined,
                        isDragging: ds.isDragging,
                        extraStyle: dp.draggableProps.style,
                      }}
                      droppable={{}}
                      completedTasks={(() => {
                        const cList = completedByBucket.get(b.id) ?? [];
                        if (cList.length === 0) return undefined;
                        return {
                          count: cList.length,
                          children: (
                            <>
                              {cList.map((entry) => (
                                <KanbanCard
                                  key={entry.card.id}
                                  task={entry.card}
                                  previewSlot={entry.previewSlot}
                                  onOpen={() => onOpenTask(entry.card.id)}
                                  draggable={{}}
                                />
                              ))}
                            </>
                          ),
                        };
                      })()}
                    >
                      {(() => {
                        const list = activeByBucket.get(b.id) ?? [];
                        if (list.length <= 50) {
                          return (
                            <Droppable droppableId={b.id} type="TASK">
                              {(dp2, ds2) => (
                                <div
                                  ref={dp2.innerRef}
                                  {...dp2.droppableProps}
                                  className={[
                                    'kanban-column__cards',
                                    ds2.isDraggingOver && 'is-over',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                >
                                  {list.map((entry, ci) => (
                                    <Draggable
                                      key={entry.card.id}
                                      draggableId={entry.card.id}
                                      index={ci}
                                    >
                                      {(dpc, dsc) => (
                                        <KanbanCard
                                          task={entry.card}
                                          previewSlot={entry.previewSlot}
                                          onOpen={() => onOpenTask(entry.card.id)}
                                          selected={focusedCardId === entry.card.id}
                                          draggable={{
                                            // Compose dnd's innerRef with our cardRefs map so
                                            // keyboard focus (focusedCardId effect) can call .focus().
                                            ref: (el) => {
                                              dpc.innerRef(el);
                                              if (el) cardRefs.current.set(entry.card.id, el);
                                              else cardRefs.current.delete(entry.card.id);
                                            },
                                            rootProps: dpc.draggableProps,
                                            handleProps: dpc.dragHandleProps ?? undefined,
                                            isDragging: dsc.isDragging,
                                            extraStyle: dpc.draggableProps.style,
                                          }}
                                        />
                                      )}
                                    </Draggable>
                                  ))}
                                  {dp2.placeholder}
                                </div>
                              )}
                            </Droppable>
                          );
                        }
                        // Virtualized buckets don't participate in keyboard navigation:
                        // rows outside the overscan window aren't mounted, so cardRefs never
                        // contains their elements and .focus() can't reach them.
                        return (
                          <VirtualizedBucketList bucketId={b.id} cards={list} onOpen={onOpenTask} />
                        );
                      })()}
                    </KanbanColumn>
                  )}
                </Draggable>
              ))}
            </KanbanBoard>
          )}
        </Droppable>
      </DragDropContext>
      <ConfirmDeleteBucketDialog
        open={pendingDeleteBucket !== null}
        onOpenChange={(v) => {
          if (!v) setPendingDeleteBucket(null);
        }}
        bucketName={pendingDeleteBucket?.name ?? ''}
        pending={deleteBucket.isPending}
        onConfirm={() => {
          if (!pendingDeleteBucket) return;
          deleteBucket.mutate(
            { bucket_id: pendingDeleteBucket.id, expected_version: pendingDeleteBucket.version },
            { onSuccess: () => setPendingDeleteBucket(null) },
          );
        }}
      />
    </>
  );
}
