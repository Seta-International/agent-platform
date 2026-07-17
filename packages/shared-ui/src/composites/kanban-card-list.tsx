import * as stylex from '@stylexjs/stylex';
import type { HTMLAttributes, ReactNode } from 'react';

const styles = stylex.create({
  list: { display: 'flex', flexDirection: 'column', gap: 6, minHeight: 40 },
  over: { background: 'var(--color-accent-muted)', borderRadius: 'var(--radius-sm)' },
});

export interface KanbanCardListProps {
  /** Droppable slot fed by the app layer's @hello-pangea/dnd wiring. */
  ref?: (el: HTMLDivElement | null) => void;
  rootProps?: HTMLAttributes<HTMLDivElement>;
  isDraggingOver?: boolean;
  children: ReactNode;
}

export function KanbanCardList({ ref, rootProps, isDraggingOver, children }: KanbanCardListProps) {
  return (
    <div
      ref={ref}
      {...rootProps}
      {...stylex.props(styles.list, isDraggingOver && styles.over)}
      data-dragging-over={isDraggingOver ? 'true' : undefined}
    >
      {children}
    </div>
  );
}
