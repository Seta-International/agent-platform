import { Card } from '@astryxdesign/core/Card';
import * as stylex from '@stylexjs/stylex';
import type { CSSProperties, HTMLAttributes, KeyboardEvent, ReactNode } from 'react';

const flash = stylex.keyframes({
  '0%': { borderColor: 'var(--color-accent)', boxShadow: '0 0 0 2px var(--color-accent-muted)' },
  // Must land on the Astryx Card's resting border (variant="default" -> withBorder).
  '100%': { borderColor: 'var(--color-border-emphasized)', boxShadow: 'none' },
});

const styles = stylex.create({
  card: {
    position: 'relative',
    width: '100%',
    textAlign: 'left',
    cursor: 'grab',
    transition: 'border-color 80ms ease-out, box-shadow 80ms ease-out',
    ':focus-visible': { outline: '2px solid var(--color-accent)', outlineOffset: '2px' },
  },
  dragging: { cursor: 'grabbing', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.18)' },
  selected: {
    borderColor: 'var(--color-accent)',
    boxShadow: '0 0 0 1px var(--color-accent), var(--shadow-sm)',
  },
  recentlyMoved: {
    animationName: { default: flash, '@media (prefers-reduced-motion: reduce)': 'none' },
    animationDuration: '1s',
    animationTimingFunction: 'ease-out',
    animationIterationCount: 1,
    borderColor: {
      default: null,
      '@media (prefers-reduced-motion: reduce)': 'var(--color-accent)',
    },
  },
  body: { display: 'flex', flexDirection: 'column', gap: 8 },
  savingDot: {
    position: 'absolute',
    top: 'var(--spacing-1)',
    right: 'var(--spacing-1)',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--color-text-secondary)',
  },
});

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
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!onOpen) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  }

  // pangea blocks drag on native interactive elements, so the root stays a Card
  // (div) with role="button" — never ClickableCard.
  return (
    <Card
      ref={draggable.ref}
      {...draggable.rootProps}
      {...draggable.handleProps}
      padding={3}
      role="button"
      tabIndex={0}
      xstyle={[
        styles.card,
        draggable.isDragging && styles.dragging,
        selected && styles.selected,
        recentlyMoved && styles.recentlyMoved,
      ]}
      style={draggable.extraStyle}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel}
      data-dragging={draggable.isDragging ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      data-recently-moved={recentlyMoved ? 'true' : undefined}
    >
      <div {...stylex.props(styles.body)}>{children}</div>
      {saving && (
        <span
          data-testid="saving-indicator"
          aria-hidden="true"
          {...stylex.props(styles.savingDot)}
        />
      )}
    </Card>
  );
}
