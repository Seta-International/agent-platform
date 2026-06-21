// biome-ignore-all lint/a11y/useSemanticElements: cannot use <button> — @hello-pangea/dnd blocks drag on native interactive elements, so the card uses div + role="button" with keyboard activation.
import type { CSSProperties, HTMLAttributes, KeyboardEvent, ReactNode } from 'react';

export interface KanbanCardShellProps {
  /** Accessible label for the card, e.g. `Task: …` or `Candidate: …`. */
  ariaLabel: string;
  children: ReactNode;
  onOpen?: () => void;
  selected?: boolean;
  recentlyMoved?: boolean;
  saving?: boolean;
  /** Render slots fed by the app layer's @hello-pangea/dnd wiring. shared-ui stays DnD-agnostic. */
  draggable: {
    ref?: (el: HTMLDivElement | null) => void;
    rootProps?: HTMLAttributes<HTMLDivElement>;
    handleProps?: HTMLAttributes<HTMLDivElement>;
    isDragging?: boolean;
    extraStyle?: CSSProperties;
  };
}

export function KanbanCardShell({
  ariaLabel,
  children,
  onOpen,
  selected,
  recentlyMoved,
  saving,
  draggable,
}: KanbanCardShellProps) {
  const className = [
    'kanban-card',
    recentlyMoved && 'kanban-card--recently-moved',
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
      aria-label={ariaLabel}
    >
      {children}
      {saving && (
        <span
          data-testid="saving-indicator"
          aria-hidden="true"
          className="kanban-card__saving-dot"
        />
      )}
    </div>
  );
}
