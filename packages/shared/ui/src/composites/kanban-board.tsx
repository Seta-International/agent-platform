import type { HTMLAttributes, ReactNode } from 'react';

export interface KanbanBoardProps {
  children: ReactNode;
  onAddBucket?: () => void;
  /** Root Droppable slot for horizontal column reorder; wired by the app layer's @hello-pangea/dnd. */
  rootDroppable?: {
    ref?: (el: HTMLElement | null) => void;
    rootProps?: HTMLAttributes<HTMLElement>;
    placeholder?: ReactNode;
  };
}

export function KanbanBoard({ children, onAddBucket, rootDroppable }: KanbanBoardProps) {
  return (
    <div ref={rootDroppable?.ref} {...rootDroppable?.rootProps} className="kanban-board">
      {children}
      {rootDroppable?.placeholder}
      {onAddBucket && (
        <button type="button" className="kanban-board__add-bucket" onClick={onAddBucket}>
          + Add bucket
        </button>
      )}
    </div>
  );
}
