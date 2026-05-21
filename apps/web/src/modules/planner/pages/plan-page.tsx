import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import {
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
  PreviewBody,
  type PreviewBodyTask,
} from '@seta/shared-ui';
import { type HTMLAttributes, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { BoardSkeleton } from '../components/board-skeleton';
import { PlanError } from '../components/plan-error';
import { PlanFilterBar } from '../components/plan-filter-bar';
import { PlanPageHeader } from '../components/plan-page-header';
import { PlanSearchInput } from '../components/plan-search-input';
import { PlanViewSwitcher } from '../components/plan-view-switcher';
import { type BucketCard, VirtualizedBucketList } from '../components/virtualized-bucket-list';
import { useCreateBucket } from '../hooks/mutations/create-bucket';
import { useCreateTask } from '../hooks/mutations/create-task';
import { useMoveBucket } from '../hooks/mutations/move-bucket';
import { useMoveTask } from '../hooks/mutations/move-task';
import { usePlanBoard } from '../hooks/queries/use-plan-board';
import { useBoardKeyboard } from '../hooks/use-board-keyboard';
import { useFilterOptions } from '../hooks/use-filter-options';
import { computeNextFocus } from '../state/compute-next-focus';
import { computeTaskMove } from '../state/compute-task-move';
import { useRecentlyMovedTasks } from '../state/recently-moved-tasks';
import { useSavingIds } from '../state/saving-ids';
import { compareOrderHint, priorityLabel } from '../state/task-derived';
import type { BoardFilters } from '../state/url-state';

interface Props {
  planId: string;
  filters: BoardFilters;
  onFiltersChange: (f: BoardFilters) => void;
  onOpenTask: (taskId: string) => void;
  view: 'board' | 'grid';
  onViewChange: (v: 'board' | 'grid') => void;
  q?: string;
  onQChange?: (next: string) => void;
  /** When provided, header shows "You have N" count. */
  currentUserId?: string;
  /** When provided, header renders breadcrumb and overflow menu. */
  groupName?: string;
  canManage?: boolean;
  onRenamePlan?: (name: string) => void;
  onArchivePlan?: () => void;
  onDeletePlan?: () => void;
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
  planId,
  filters,
  onFiltersChange,
  onOpenTask,
  view,
  onViewChange,
  q = '',
  onQChange,
  currentUserId,
  groupName,
  canManage,
  onRenamePlan,
  onArchivePlan,
  onDeletePlan,
}: Props) {
  const boardQ = usePlanBoard(planId);
  const filterOptions = useFilterOptions(boardQ.data);
  const moveTask = useMoveTask(planId);
  const moveBucket = useMoveBucket(planId);
  const createTask = useCreateTask(planId);
  const createBucket = useCreateBucket(planId);
  const savingIds = useSavingIds((s) => s.ids);
  const recentlyMoved = useRecentlyMovedTasks((s) => s.ids);

  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

  const tasksByBucket = useMemo(() => {
    const map = new Map<string | null, BucketCard[]>();
    if (!boardQ.data) return map;
    const sourceById = new Map(boardQ.data.tasks.map((t) => [t.id, t]));
    const assigneeIdSet = new Set(filters.assignee_ids);
    const labelIdSet = new Set(filters.label_ids);
    const skillTagSet = new Set(filters.skill_tags);
    for (const t of boardQ.data.tasks) {
      if (filters.assignee_ids.length && !t.assignees.some((a) => assigneeIdSet.has(a.user_id))) {
        continue;
      }
      if (filters.label_ids.length && !t.labels.some((l) => labelIdSet.has(l.id))) {
        continue;
      }
      if (filters.skill_tags.length && !t.skill_tags.some((s) => skillTagSet.has(s))) {
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
        due_label: t.due_at ? new Date(t.due_at).toLocaleDateString() : undefined,
        label: t.labels[0] ? { name: t.labels[0].name, color: t.labels[0].color } : undefined,
        assignees: t.assignees.map((a) => ({
          user_id: a.user_id,
          display_name: a.display_name,
        })),
        saving: savingIds.has(t.id),
        recentlyMoved: recentlyMoved.has(t.id),
      };
      const previewTask: PreviewBodyTask = {
        description: t.description ?? undefined,
      };
      const previewSlot: ReactNode = (
        <PreviewBody task={previewTask} variant={t.preview_type ?? 'automatic'} />
      );
      const arr = map.get(t.bucket_id) ?? [];
      arr.push({ card, previewSlot });
      map.set(t.bucket_id, arr);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => {
        const ta = sourceById.get(a.card.id);
        const tb = sourceById.get(b.card.id);
        return compareOrderHint(ta?.order_hint ?? null, tb?.order_hint ?? null);
      });
    }
    return map;
  }, [boardQ.data, filters, savingIds, recentlyMoved, q]);

  // Build a flat bucket structure for computeNextFocus. Derived from boardQ.data.buckets so
  // the order matches the rendered columns. Falls back to empty when data isn't loaded yet.
  const structure = useMemo(
    () => ({
      buckets: (boardQ.data?.buckets ?? []).map((b) => ({
        id: b.id,
        cardIds: (tasksByBucket.get(b.id) ?? []).map((e) => e.card.id),
      })),
    }),
    [boardQ.data?.buckets, tasksByBucket],
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
      if (!boardQ.data) return;
      const { plan: p, buckets: bs } = boardQ.data;
      const bucketId = focusedCardId
        ? bs.find((b) => (tasksByBucket.get(b.id) ?? []).some((e) => e.card.id === focusedCardId))
            ?.id
        : bs[0]?.id;
      if (bucketId) createTask.mutate({ plan_id: p.id, bucket_id: bucketId, title: 'New task' });
    },
  });

  if (boardQ.isPending) {
    return <BoardSkeleton />;
  }
  if (boardQ.isError || !boardQ.data) {
    return <PlanError onRetry={() => boardQ.refetch()} />;
  }
  const { plan, buckets, tasks } = boardQ.data;
  const hasActiveFilters =
    filters.assignee_ids.length > 0 ||
    filters.label_ids.length > 0 ||
    filters.skill_tags.length > 0 ||
    q.length > 0;
  const totalVisible = Array.from(tasksByBucket.values()).reduce((acc, l) => acc + l.length, 0);

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
    const inTarget = (tasksByBucket.get(targetBucketId) ?? [])
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
    <div className="plan-page">
      <PlanPageHeader
        planName={plan.name}
        groupName={groupName}
        groupId={plan.group_id}
        bucketCount={buckets.length}
        taskCount={tasks.length}
        myTaskCount={
          currentUserId
            ? tasks.filter((t) => t.assignees.some((a) => a.user_id === currentUserId)).length
            : undefined
        }
        canRename={canManage}
        onRename={onRenamePlan}
        onArchive={canManage ? onArchivePlan : undefined}
        onDelete={canManage ? onDeletePlan : undefined}
      />
      <div className="plan-toolbar">
        <PlanFilterBar
          filters={filters}
          onChange={onFiltersChange}
          assigneeOptions={filterOptions.assigneeOptions}
          labelOptions={filterOptions.labelOptions}
          skillOptions={filterOptions.skillOptions}
        />
        <div className="plan-toolbar__right">
          {onQChange && <PlanSearchInput value={q} onChange={onQChange} />}
          <PlanViewSwitcher value={view} onChange={onViewChange} />
        </div>
      </div>

      {hasActiveFilters && totalVisible === 0 && (
        <div role="status" className="plan-no-results">
          <p>No tasks match these filters.</p>
          <button
            type="button"
            onClick={() => {
              onFiltersChange({ assignee_ids: [], label_ids: [], skill_tags: [] });
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
              onAddBucket={() =>
                createBucket.mutate({
                  name: 'New bucket',
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
                      count={(tasksByBucket.get(b.id) ?? []).length}
                      status={statusForBucketName(b.name)}
                      onCreateTask={(input) =>
                        createTask.mutate({ plan_id: plan.id, bucket_id: b.id, ...input })
                      }
                      draggableHandle={{
                        ref: dp.innerRef,
                        rootProps: dp.draggableProps,
                        handleProps: dp.dragHandleProps ?? undefined,
                        isDragging: ds.isDragging,
                        extraStyle: dp.draggableProps.style,
                      }}
                      droppable={{}}
                    >
                      {(() => {
                        const list = tasksByBucket.get(b.id) ?? [];
                        if (list.length <= 50) {
                          return (
                            <Droppable droppableId={b.id} type="TASK">
                              {(dp2, ds2) => (
                                <div
                                  ref={dp2.innerRef}
                                  {...dp2.droppableProps}
                                  className={ds2.isDraggingOver ? 'is-over' : ''}
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
    </div>
  );
}
