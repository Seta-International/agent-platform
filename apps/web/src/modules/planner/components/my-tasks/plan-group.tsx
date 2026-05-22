import { Draggable, Droppable } from '@hello-pangea/dnd';
import { Link } from '@tanstack/react-router';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, ExternalLink, Layout } from 'lucide-react';
import { useRef } from 'react';
import { MtTaskRow, type MyTasksRowTask } from './mt-task-row';
import type { SectionKey } from './types';

export interface PlanGroupRef {
  id: string;
  name: string;
  color: string;
}

export interface GroupRef {
  id: string;
  name: string;
}

export interface PlanGroupData {
  plan: PlanGroupRef;
  group: GroupRef;
  tasks: ReadonlyArray<MyTasksRowTask>;
}

interface Props {
  sectionKey: SectionKey;
  group: PlanGroupData;
  first?: boolean;
}

// virtualization kicks in once rows would noticeably affect layout cost;
// below this threshold the non-virtual path keeps DOM simple for tests and a11y
const VIRTUAL_THRESHOLD = 10;

export function PlanGroup({ sectionKey, group, first = false }: Props) {
  const taskCount = group.tasks.length;
  const droppableId = `mt:${sectionKey}:${group.plan.id}`;
  const virtualize = taskCount >= VIRTUAL_THRESHOLD;
  const parentRef = useRef<HTMLDivElement | null>(null);
  // TanStack Virtual returns functions that can't be safely memoized — React Compiler skips this hook
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: taskCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 6,
  });

  return (
    <div
      data-testid="plan-group"
      data-plan-id={group.plan.id}
      className={
        (first ? 'mt-2.5' : 'mt-3.5') +
        ' border border-hairline rounded-lg bg-canvas overflow-hidden'
      }
    >
      <div className="flex items-center gap-2 pl-0 pr-3 py-2 border-b border-hairline-tertiary bg-surface-1 relative">
        <div
          data-testid="plan-color-rail"
          className="w-[3px] self-stretch rounded-r-[2px]"
          style={{ background: group.plan.color }}
        />
        <Layout size={12} className="ml-2" style={{ color: group.plan.color }} />
        <span className="text-[12.5px] font-semibold">{group.plan.name}</span>
        <ChevronRight size={9} className="text-ink-tertiary" />
        <span className="text-[11px] text-ink-subtle">{group.group.name}</span>
        <div className="flex-1" />
        <span className="text-[11px] text-ink-subtle">
          {taskCount} task{taskCount !== 1 ? 's' : ''}
        </span>
        <Link
          to="/planner/plans/$planId"
          params={{ planId: group.plan.id }}
          className="inline-flex items-center gap-1 h-[22px] px-1.5 text-[11px] text-ink-muted hover:text-ink rounded-md no-underline"
        >
          Open plan
          <ExternalLink size={10} />
        </Link>
      </div>

      <div
        className={
          'grid grid-cols-[24px_60px_minmax(0,1fr)_90px_130px_100px_110px_120px] ' +
          'gap-3 px-6 pr-3.5 py-[7px] text-[10.5px] font-medium text-ink-subtle ' +
          'uppercase tracking-[0.06em] border-b border-hairline-tertiary bg-canvas'
        }
      >
        <span />
        <span />
        <span>Task</span>
        <span>Priority</span>
        <span>Progress</span>
        <span>Due</span>
        <span>Labels</span>
        <span>Assignees</span>
      </div>

      {virtualize ? (
        <Droppable
          droppableId={droppableId}
          type="MT_TASK"
          mode="virtual"
          renderClone={(provided, _snapshot, rubric) => {
            const t = group.tasks[rubric.source.index];
            if (!t) return <div ref={provided.innerRef} {...provided.draggableProps} />;
            return (
              <div
                ref={provided.innerRef}
                {...provided.draggableProps}
                style={provided.draggableProps.style}
              >
                <MtTaskRow task={t} dragHandleProps={provided.dragHandleProps ?? undefined} />
              </div>
            );
          }}
        >
          {(dp) => (
            <div
              ref={(node) => {
                dp.innerRef(node);
                parentRef.current = node;
              }}
              {...dp.droppableProps}
              data-testid="plan-group-rows-virtualized"
              style={{ maxHeight: 480, overflow: 'auto', position: 'relative' }}
            >
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((vi) => {
                  const t = group.tasks[vi.index];
                  if (!t) return null;
                  return (
                    <div
                      key={t.id}
                      data-task-row
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${vi.start}px)`,
                      }}
                    >
                      <Draggable draggableId={t.id} index={vi.index}>
                        {(dpc) => (
                          <div ref={dpc.innerRef} {...dpc.draggableProps}>
                            <MtTaskRow
                              task={t}
                              dragHandleProps={dpc.dragHandleProps ?? undefined}
                            />
                          </div>
                        )}
                      </Draggable>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Droppable>
      ) : (
        <Droppable droppableId={droppableId} type="MT_TASK">
          {(dp) => (
            <div ref={dp.innerRef} {...dp.droppableProps}>
              {group.tasks.map((t, i) => (
                <Draggable key={t.id} draggableId={t.id} index={i}>
                  {(dpc) => (
                    <div ref={dpc.innerRef} {...dpc.draggableProps}>
                      <MtTaskRow task={t} dragHandleProps={dpc.dragHandleProps ?? undefined} />
                    </div>
                  )}
                </Draggable>
              ))}
              {dp.placeholder}
            </div>
          )}
        </Droppable>
      )}
    </div>
  );
}
