import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { AvatarStack } from './avatar-stack';
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
  blocked?: boolean;
}

export interface KanbanCardProps {
  task: KanbanCardTask;
  onOpen?: () => void;
  selected?: boolean;
  /** Optional body content rendered between the title and the meta footer. */
  previewSlot?: ReactNode;
  /** Render slots fed by the app layer's @hello-pangea/dnd wiring. shared-ui stays DnD-agnostic. */
  draggable: {
    ref?: (el: HTMLButtonElement | null) => void;
    rootProps?: ButtonHTMLAttributes<HTMLButtonElement>;
    handleProps?: ButtonHTMLAttributes<HTMLButtonElement>;
    isDragging?: boolean;
    extraStyle?: CSSProperties;
  };
}

export function KanbanCard({ task, onOpen, selected, previewSlot, draggable }: KanbanCardProps) {
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
      <div className="kanban-card__title">
        {task.blocked && (
          <span
            role="img"
            aria-label="Blocked"
            className="kanban-card__blocked-dot"
            title="Blocked"
          />
        )}
        {task.title}
      </div>
      {previewSlot}
      <div className="kanban-card__meta">
        <PriorityIcon level={task.priority} />
        {task.label && <LabelChip name={task.label.name} color={task.label.color} />}
        {task.due_label && <span className="kanban-card__due">{task.due_label}</span>}
        <AvatarStack assignees={task.assignees} />
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
