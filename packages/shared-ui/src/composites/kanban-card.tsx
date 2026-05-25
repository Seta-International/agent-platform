// biome-ignore-all lint/a11y/useSemanticElements: cannot use <button> — @hello-pangea/dnd blocks drag on native interactive elements, so the card uses div + role="button" with keyboard activation.
import { CheckSquare } from 'lucide-react';
import type { CSSProperties, HTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import { AvatarStack } from './avatar-stack';
import { LabelChip } from './label-chip';
import { PriorityIcon } from './priority-icon';
import { SyncBadge, type SyncState } from './sync-badge';

export interface KanbanCardTask {
  id: string;
  title: string;
  priority: 'urgent' | 'important' | 'medium' | 'low';
  /** Short start-date label shown on the card. Pair with `due_label` for a range. */
  start_label?: string;
  due_label?: string;
  label?: { name: string; color?: string };
  assignees: Array<{ user_id: string; display_name: string }>;
  recentlyMoved?: boolean;
  saving?: boolean;
  blocked?: boolean;
  external_source?: 'native' | 'm365';
  sync_status?: SyncState | null;
  external_synced_at?: string | null;
  /** Compact checklist progress shown on the card meta row when total > 0. */
  checklist_summary?: { total: number; checked: number };
  isCompleted?: boolean;
}

export interface KanbanCardProps {
  task: KanbanCardTask;
  onOpen?: () => void;
  selected?: boolean;
  /** Optional body content rendered between the title and the meta footer. */
  previewSlot?: ReactNode;
  /** Render slots fed by the app layer's @hello-pangea/dnd wiring. shared-ui stays DnD-agnostic. */
  draggable: {
    ref?: (el: HTMLDivElement | null) => void;
    rootProps?: HTMLAttributes<HTMLDivElement>;
    handleProps?: HTMLAttributes<HTMLDivElement>;
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

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!onOpen) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  }

  return (
    <div
      ref={draggable.ref}
      {...draggable.rootProps}
      {...draggable.handleProps}
      role="button"
      tabIndex={0}
      className={className}
      style={draggable.extraStyle}
      onClick={onOpen}
      onKeyDown={onKeyDown}
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
        <span className={task.isCompleted ? 'line-through opacity-50' : undefined}>
          {task.title}
        </span>
      </div>
      {previewSlot}
      <div className="kanban-card__meta">
        <PriorityIcon level={task.priority} />
        {task.label && <LabelChip name={task.label.name} color={task.label.color} />}
        {(task.start_label || task.due_label) && (
          <span className="kanban-card__due">
            {task.start_label && task.due_label
              ? `${task.start_label} → ${task.due_label}`
              : (task.start_label ?? task.due_label)}
          </span>
        )}
        {task.checklist_summary && task.checklist_summary.total > 0 && (
          <ChecklistChip
            total={task.checklist_summary.total}
            checked={task.checklist_summary.checked}
          />
        )}
        <AvatarStack assignees={task.assignees} />
      </div>
      {task.saving && (
        <span
          data-testid="saving-indicator"
          aria-hidden="true"
          className="kanban-card__saving-dot"
        />
      )}
      {task.external_source === 'm365' && (
        <span style={{ position: 'absolute', right: 8, top: 8 }}>
          <SyncBadge
            state={task.sync_status ?? null}
            synced_at={task.external_synced_at ?? null}
            size="mini"
          />
        </span>
      )}
    </div>
  );
}

function ChecklistChip({ total, checked }: { total: number; checked: number }) {
  const complete = checked >= total;
  return (
    <span
      role="img"
      aria-label={`Checklist ${checked} of ${total} done`}
      className={`kanban-card__checklist-chip ${complete ? 'kanban-card__checklist-chip--complete' : ''}`}
    >
      <CheckSquare className="size-3" aria-hidden />
      {checked}/{total}
    </span>
  );
}
