import { type CSSProperties, type HTMLAttributes, type ReactNode, useState } from 'react';
import { KbdHint } from './kbd-hint';

export interface KanbanColumnProps {
  name: string;
  count: number;
  status?: 'muted' | 'primary' | 'warning' | 'success';
  children: ReactNode;
  onCreateTask?: (title: string) => void;
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

  function submit() {
    const v = value.trim();
    if (v && onCreateTask) onCreateTask(v);
    setValue('');
    setComposing(false);
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
            // biome-ignore lint/a11y/noAutofocus: quick-create reveal requires immediate focus to be useful
            autoFocus
            placeholder="Add a task…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') {
                setComposing(false);
                setValue('');
              }
            }}
            onBlur={() => {
              if (!value.trim()) setComposing(false);
            }}
          />
        </div>
      )}
    </section>
  );
}
