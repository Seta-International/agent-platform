import { type CSSProperties, type HTMLAttributes, type ReactNode, useState } from 'react';
import { DatePill } from '../task/date-pill';
import { type PreviewType, PreviewTypeRadio } from '../task/preview-type-radio';
import { PrioritySegmented } from '../task/priority-segmented';
import { KbdHint } from './kbd-hint';

export interface QuickCreateTaskInput {
  title: string;
  start_at?: string;
  priority_number?: 1 | 3 | 5 | 9;
  preview_type?: PreviewType;
}

export interface KanbanColumnProps {
  name: string;
  count: number;
  status?: 'muted' | 'primary' | 'warning' | 'success';
  children: ReactNode;
  onCreateTask?: (input: QuickCreateTaskInput) => void;
  droppable: {
    ref?: (el: HTMLElement | null) => void;
    rootProps?: HTMLAttributes<HTMLElement>;
    isDraggingOver?: boolean;
    placeholder?: ReactNode;
  };
  draggableHandle: {
    ref?: (el: HTMLElement | null) => void;
    rootProps?: HTMLAttributes<HTMLElement>;
    handleProps?: HTMLAttributes<HTMLElement>;
    isDragging?: boolean;
    extraStyle?: CSSProperties;
  };
}

const DEFAULT_PRIORITY: 1 | 3 | 5 | 9 = 5;
const DEFAULT_PREVIEW_TYPE: PreviewType = 'automatic';

export function KanbanColumn({
  name,
  count,
  status,
  children,
  onCreateTask,
  droppable,
  draggableHandle,
}: KanbanColumnProps) {
  const [composing, setComposing] = useState(false);
  const [value, setValue] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [startAt, setStartAt] = useState<string | null>(null);
  const [priority, setPriority] = useState<1 | 3 | 5 | 9>(DEFAULT_PRIORITY);
  const [previewType, setPreviewType] = useState<PreviewType>(DEFAULT_PREVIEW_TYPE);

  function resetCompose() {
    setValue('');
    setMoreOpen(false);
    setStartAt(null);
    setPriority(DEFAULT_PRIORITY);
    setPreviewType(DEFAULT_PREVIEW_TYPE);
    setComposing(false);
  }

  function submit() {
    const v = value.trim();
    if (!v || !onCreateTask) {
      resetCompose();
      return;
    }
    const payload: QuickCreateTaskInput = { title: v };
    if (startAt) payload.start_at = startAt;
    if (priority !== DEFAULT_PRIORITY) payload.priority_number = priority;
    if (previewType !== DEFAULT_PREVIEW_TYPE) payload.preview_type = previewType;
    onCreateTask(payload);
    resetCompose();
  }

  return (
    <section
      ref={draggableHandle.ref}
      {...draggableHandle.rootProps}
      style={draggableHandle.extraStyle}
      className={['kanban-column', draggableHandle.isDragging && 'kanban-column--dragging']
        .filter(Boolean)
        .join(' ')}
      aria-label={`Bucket: ${name}`}
    >
      <header className="kanban-column__header">
        {/* Drag handle is a neutral div so @hello-pangea/dnd's role="button" lands on a div, not header */}
        <div className="kanban-column__drag-handle" {...draggableHandle.handleProps}>
          <span className={`status-dot status-dot--${status ?? 'muted'}`} aria-hidden="true" />
          <span className="kanban-column__name">{name}</span>
          <span className="kanban-column__count">{count}</span>
        </div>
      </header>

      <div
        ref={droppable.ref}
        {...droppable.rootProps}
        className={['kanban-column__list', droppable.isDraggingOver && 'kanban-column__list--over']
          .filter(Boolean)
          .join(' ')}
      >
        {children}
        {droppable.placeholder}
      </div>

      {!composing && onCreateTask && (
        <button
          type="button"
          className="kanban-column__quick-create"
          onClick={() => setComposing(true)}
          title="Add a task (C)"
        >
          + Add a task
          <KbdHint keys={['C']} className="ml-1" />
        </button>
      )}
      {composing && (
        <div className="kanban-column__compose">
          <input
            placeholder="Add a task…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') resetCompose();
            }}
            onBlur={() => {
              // Keep the disclosure open across blur events so a click on a control inside
              // it doesn't tear down the panel before the click registers.
              if (!value.trim() && !moreOpen) setComposing(false);
            }}
          />
          <button
            type="button"
            className="kanban-column__more-options-toggle"
            aria-expanded={moreOpen}
            // Why: mouseDown wins the race against the input's onBlur, which would otherwise
            // tear down the compose panel before the click registers.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMoreOpen((v) => !v)}
          >
            More options
          </button>
          {moreOpen && (
            <div className="kanban-column__more-options">
              <div className="kanban-column__more-options-row">
                <DatePill kind="Start" value={startAt} onChange={setStartAt} clearable />
              </div>
              <div className="kanban-column__more-options-row">
                <PrioritySegmented value={priority} onChange={setPriority} />
              </div>
              <div className="kanban-column__more-options-row">
                <PreviewTypeRadio value={previewType} onChange={setPreviewType} />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
