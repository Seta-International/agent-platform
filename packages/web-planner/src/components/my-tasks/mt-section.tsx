import { Draggable, Droppable } from '@hello-pangea/dnd';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown } from 'lucide-react';
import { useRef, useState } from 'react';
import { MtTaskRow, type MyTasksRowTask } from './mt-task-row';
import type { SectionKey, SectionTone } from './types';

export type { SectionKey, SectionTone } from './types';

export interface MyTasksSection {
  key: SectionKey;
  label: string;
  tone: SectionTone;
  count: number;
  open: boolean;
  hint?: string;
  tasks: ReadonlyArray<MyTasksRowTask>;
}

interface Props {
  section: MyTasksSection;
}

const TONE_BG: Record<SectionTone, string> = {
  danger: 'var(--color-danger-tint)',
  warning: 'var(--color-warning-tint)',
  primary: 'var(--color-primary-tint)',
  muted: 'var(--color-surface-2)',
  success: 'var(--color-success-tint)',
};

const TONE_INK: Record<SectionTone, string> = {
  danger: 'var(--color-danger)',
  warning: 'var(--color-warning)',
  primary: 'var(--color-primary-ink)',
  muted: 'var(--color-ink-muted)',
  success: 'var(--color-success)',
};

const TONE_DOT: Record<SectionTone, string> = {
  danger: 'dot--danger',
  warning: 'dot--warning',
  primary: 'dot--primary',
  muted: 'dot--muted',
  success: 'dot--success',
};

// Shared grid template — every row + the section column-header strip must use this so
// columns visually line up. 8 cells: drag, title+status, plan, priority, progress, due, labels, assignees.
export const MT_GRID_COLS =
  'grid-cols-[24px_minmax(0,1fr)_140px_90px_130px_100px_110px_120px]' as const;

// virtualization kicks in once rows would noticeably affect layout cost;
// below this threshold the non-virtual path keeps DOM simple for tests and a11y
const VIRTUAL_THRESHOLD = 20;

export function MtSection({ section }: Props) {
  const [open, setOpen] = useState(section.open);
  const taskCount = section.tasks.length;
  const droppableId = `mt:${section.key}`;
  const virtualize = open && taskCount >= VIRTUAL_THRESHOLD;
  const parentRef = useRef<HTMLDivElement | null>(null);
  // TanStack Virtual returns functions that can't be safely memoized — React Compiler skips this hook
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: taskCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 6,
  });

  return (
    <section
      data-testid="mt-section"
      data-section={section.key}
      className="border-b border-hairline last:border-b-0"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-7 py-3 bg-transparent text-left hover:bg-surface-1 transition-colors"
      >
        <ChevronDown
          size={12}
          className="text-ink-subtle transition-transform duration-150"
          style={{ transform: open ? 'none' : 'rotate(-90deg)' }}
        />
        <span data-testid="section-tone-dot" className={`dot ${TONE_DOT[section.tone]}`} />
        <span className="text-[13px] font-semibold -tracking-[0.005em]">{section.label}</span>
        <span
          data-testid="section-count"
          className="text-[11px] font-semibold px-[7px] py-px rounded-full"
          style={{ background: TONE_BG[section.tone], color: TONE_INK[section.tone] }}
        >
          {section.count}
        </span>
        {section.hint && <span className="text-[11px] text-ink-subtle">· {section.hint}</span>}
        <div className="flex-1" />
        {open && taskCount > 0 && (
          <span className="text-[11px] text-ink-subtle">Sorted by your priority</span>
        )}
      </button>

      {open && taskCount > 0 && (
        <>
          <div
            data-testid="mt-section-columns"
            className={
              `sticky top-0 z-10 grid ${MT_GRID_COLS} ` +
              'gap-3 px-7 py-2.5 text-[10.5px] font-medium uppercase tracking-wider ' +
              'text-ink-subtle border-b border-hairline bg-canvas'
            }
          >
            <span />
            <span>Task</span>
            <span>Plan</span>
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
                const t = section.tasks[rubric.source.index];
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
                  data-testid="mt-section-virtualized"
                  style={{ maxHeight: 520, overflow: 'auto', position: 'relative' }}
                >
                  <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                    {virtualizer.getVirtualItems().map((vi) => {
                      const t = section.tasks[vi.index];
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
                  {section.tasks.map((t, i) => (
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
        </>
      )}
    </section>
  );
}
