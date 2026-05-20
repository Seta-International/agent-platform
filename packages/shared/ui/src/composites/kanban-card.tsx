import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { LabelChip } from './label-chip';
import { PriorityIcon } from './priority-icon';

export interface KanbanCardTask {
  id: string;
  title: string;
  priority: 'urgent' | 'important' | 'medium' | 'low';
  due_label?: string;
  label?: { name: string; color?: string };
  assignees: Array<{ user_id: string; display_name: string }>;
  recentlyMoved?: boolean;
  saving?: boolean;
}

export interface KanbanCardProps {
  task: KanbanCardTask;
  onOpen?: () => void;
  selected?: boolean;
  /** Render slots fed by the app layer's @hello-pangea/dnd wiring. shared-ui stays DnD-agnostic. */
  draggable: {
    ref?: (el: HTMLButtonElement | null) => void;
    rootProps?: ButtonHTMLAttributes<HTMLButtonElement>;
    handleProps?: ButtonHTMLAttributes<HTMLButtonElement>;
    isDragging?: boolean;
    extraStyle?: CSSProperties;
  };
}

export function KanbanCard({ task, onOpen, selected, draggable }: KanbanCardProps) {
  const className = [
    'kanban-card',
    task.recentlyMoved && 'kanban-card--recently-moved',
    selected && 'kanban-card--selected',
    draggable.isDragging && 'kanban-card--dragging',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={draggable.ref}
      {...draggable.rootProps}
      {...draggable.handleProps}
      type="button"
      className={className}
      style={draggable.extraStyle}
      onClick={onOpen}
      aria-label={`Task: ${task.title}`}
    >
      <div className="kanban-card__title">{task.title}</div>
      <div className="kanban-card__meta">
        <PriorityIcon level={task.priority} />
        {task.label && <LabelChip name={task.label.name} color={task.label.color} />}
        {task.due_label && <span className="kanban-card__due">{task.due_label}</span>}
        <span className="kanban-card__assignees">
          {task.assignees.slice(0, 3).map((a) => (
            <span key={a.user_id} className="kanban-card__avatar" title={a.display_name}>
              {a.display_name
                .split(' ')
                .map((p) => p[0])
                .join('')
                .slice(0, 2)}
            </span>
          ))}
          {task.assignees.length > 3 && (
            <span className="kanban-card__avatar-more">+{task.assignees.length - 3}</span>
          )}
        </span>
      </div>
      {task.saving && (
        <span
          data-testid="saving-indicator"
          aria-hidden="true"
          className="kanban-card__saving-dot"
        />
      )}
    </button>
  );
}
