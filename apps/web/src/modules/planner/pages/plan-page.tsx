import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { KanbanBoard, KanbanCard, type KanbanCardTask, KanbanColumn } from '@seta/shared-ui';
import { type HTMLAttributes, useMemo } from 'react';
import { PlanFilterBar } from '../components/plan-filter-bar';
import { PlanPageHeader } from '../components/plan-page-header';
import { PlanViewSwitcher } from '../components/plan-view-switcher';
import { useCreateBucket } from '../hooks/mutations/create-bucket';
import { useCreateTask } from '../hooks/mutations/create-task';
import { useMoveTask } from '../hooks/mutations/move-task';
import { useReorderBucket } from '../hooks/mutations/reorder-bucket';
import { usePlanBoard } from '../hooks/queries/use-plan-board';
import { useBoardKeyboard } from '../hooks/use-board-keyboard';
import { useSavingIds } from '../state/saving-ids';
import type { BoardFilters } from '../state/url-state';

interface Props {
  planId: string;
  filters: BoardFilters;
  onFiltersChange: (f: BoardFilters) => void;
  onOpenTask: (taskId: string) => void;
  view: 'board' | 'grid';
  onViewChange: (v: 'board' | 'grid') => void;
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
}: Props) {
  const boardQ = usePlanBoard(planId);
  const moveTask = useMoveTask(planId);
  const reorderBucket = useReorderBucket(planId);
  const createTask = useCreateTask(planId);
  const createBucket = useCreateBucket(planId);
  const savingIds = useSavingIds((s) => s.ids);
  useBoardKeyboard({});

  const tasksByBucket = useMemo(() => {
    const map = new Map<string | null, KanbanCardTask[]>();
    if (!boardQ.data) return map;
    const sourceById = new Map(boardQ.data.tasks.map((t) => [t.id, t]));
    for (const t of boardQ.data.tasks) {
      if (
        filters.assignee_ids.length &&
        !t.assignees.some((a) => filters.assignee_ids.includes(a.user_id))
      ) {
        continue;
      }
      if (filters.label_ids.length && !t.labels.some((l) => filters.label_ids.includes(l.id))) {
        continue;
      }
      if (filters.skill_tags.length && !t.skill_tags.some((s) => filters.skill_tags.includes(s))) {
        continue;
      }
      const card: KanbanCardTask = {
        id: t.id,
        title: t.title,
        priority: t.priority,
        due_label: t.due_at ? new Date(t.due_at).toLocaleDateString() : undefined,
        label: t.labels[0] ? { name: t.labels[0].name, color: t.labels[0].color } : undefined,
        assignees: t.assignees.map((a) => ({
          user_id: a.user_id,
          display_name: a.display_name,
        })),
        saving: savingIds.has(t.id),
      };
      const arr = map.get(t.bucket_id) ?? [];
      arr.push(card);
      map.set(t.bucket_id, arr);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => {
        const ta = sourceById.get(a.id);
        const tb = sourceById.get(b.id);
        return (ta?.sort_order ?? 0) - (tb?.sort_order ?? 0);
      });
    }
    return map;
  }, [boardQ.data, filters, savingIds]);

  if (boardQ.isPending) {
    return <div data-testid="board-skeleton">Loading…</div>;
  }
  if (boardQ.isError || !boardQ.data) {
    return <div role="alert">Couldn't load the plan.</div>;
  }
  const { plan, buckets, tasks } = boardQ.data;

  function onDragEnd(r: DropResult) {
    if (!r.destination) return;
    if (
      r.source.droppableId === r.destination.droppableId &&
      r.source.index === r.destination.index
    ) {
      return;
    }

    if (r.type === 'COLUMN') {
      const afterId = r.destination.index === 0 ? undefined : buckets[r.destination.index - 1]?.id;
      const bucket = buckets.find((b) => b.id === r.draggableId);
      if (!bucket) return;
      reorderBucket.mutate({
        bucket_id: bucket.id,
        expected_version: bucket.version,
        after_bucket_id: afterId,
      });
      return;
    }

    const targetBucketId =
      r.destination.droppableId === NO_BUCKET_DROPPABLE_ID ? null : r.destination.droppableId;
    const inTarget = (tasksByBucket.get(targetBucketId) ?? []).filter(
      (c) => c.id !== r.draggableId,
    );
    const afterId = r.destination.index === 0 ? undefined : inTarget[r.destination.index - 1]?.id;
    const task = tasks.find((t) => t.id === r.draggableId);
    if (!task) return;
    moveTask.mutate({
      task_id: task.id,
      expected_version: task.version,
      to_bucket_id: targetBucketId,
      after_task_id: afterId,
    });
  }

  return (
    <div className="plan-page">
      <PlanPageHeader planName={plan.name} bucketCount={buckets.length} taskCount={tasks.length} />
      <div className="plan-toolbar">
        <PlanFilterBar filters={filters} onChange={onFiltersChange} />
        <PlanViewSwitcher value={view} onChange={onViewChange} gridDisabled />
      </div>

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
                      onCreateTask={(title) =>
                        createTask.mutate({ plan_id: plan.id, bucket_id: b.id, title })
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
                      <Droppable droppableId={b.id} type="TASK">
                        {(dp2, ds2) => (
                          <div
                            ref={dp2.innerRef}
                            {...dp2.droppableProps}
                            className={ds2.isDraggingOver ? 'is-over' : ''}
                          >
                            {(tasksByBucket.get(b.id) ?? []).map((card, ci) => (
                              <Draggable key={card.id} draggableId={card.id} index={ci}>
                                {(dpc, dsc) => (
                                  <KanbanCard
                                    task={card}
                                    onOpen={() => onOpenTask(card.id)}
                                    draggable={{
                                      ref: dpc.innerRef,
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
