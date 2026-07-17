import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';

/** Tile geometry the paddings below are derived from — keep the three in sync. */
const TILE_SIZE = 56;
const TILE_OVERHANG = TILE_SIZE / 2;

const rise = stylex.keyframes({
  from: { opacity: 0, transform: 'translateY(12px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

const drop = stylex.keyframes({
  from: { opacity: 0, transform: 'translate(-50%, -6px)' },
  to: { opacity: 1, transform: 'translate(-50%, 0)' },
});

const styles = stylex.create({
  root: {
    position: 'relative',
    width: '100%',
    // Reserves the half of the brand tile that hangs above the panel edge.
    paddingTop: TILE_OVERHANG,
    animationName: { default: rise, '@media (prefers-reduced-motion: reduce)': 'none' },
    animationDuration: '0.5s',
    animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
    animationFillMode: 'both',
  },
  // Frosted glass over the constellation: translucent card colour + blur lets the
  // mesh lines run visibly beneath the panel, which is what ties it to the backdrop.
  panel: {
    position: 'relative',
    backgroundColor: 'color-mix(in srgb, var(--color-background-card) 82%, transparent)',
    backdropFilter: 'blur(20px) saturate(120%)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'color-mix(in srgb, var(--color-border-emphasized) 60%, transparent)',
    borderRadius: 'var(--radius-container)',
    boxShadow: 'var(--shadow-high)',
    paddingTop: TILE_OVERHANG + 20,
    paddingBottom: 'var(--spacing-8)',
    paddingInline: 'var(--spacing-8)',
  },
  // Accent seam along the top border — the "live wire" the panel hangs from.
  filament: {
    position: 'absolute',
    top: -1,
    insetInline: '14%',
    height: 1,
    pointerEvents: 'none',
    background:
      'linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-text-accent) 55%, transparent) 50%, transparent)',
  },
  // The brand mark as a node badge straddling the panel's top edge.
  tile: {
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: 'translate(-50%, 0)',
    zIndex: 1,
    width: TILE_SIZE,
    height: TILE_SIZE,
    display: 'grid',
    placeItems: 'center',
    backgroundColor: 'var(--color-background-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'color-mix(in srgb, var(--color-border-emphasized) 70%, transparent)',
    borderRadius: 'var(--radius-element)',
    boxShadow: 'var(--shadow-med)',
    animationName: { default: drop, '@media (prefers-reduced-motion: reduce)': 'none' },
    animationDuration: '0.5s',
    animationDelay: '0.12s',
    animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
    animationFillMode: 'both',
  },
  // letter-spacing and text-transform inherit into the Text child rendered inside.
  eyebrow: {
    display: 'block',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    marginBottom: 'var(--spacing-4)',
  },
});

export interface AuthPanelProps {
  /** The brand mark rendered inside the floating tile (e.g. `<SetaMark />`). */
  brand: ReactNode;
  /** Letterspaced eyebrow rendered above the panel content. */
  eyebrow?: ReactNode;
  children: ReactNode;
}

/**
 * Auth surface designed to sit on `AuthBackdrop`: a frosted-glass panel the mesh
 * runs beneath, with the brand mark docked as a badge on its top edge and an
 * accent filament along the seam. Purely presentational — steps render inside.
 */
export function AuthPanel({ brand, eyebrow, children }: AuthPanelProps) {
  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.tile)}>{brand}</div>
      <section {...stylex.props(styles.panel)}>
        <div {...stylex.props(styles.filament)} aria-hidden="true" />
        {eyebrow ? <span {...stylex.props(styles.eyebrow)}>{eyebrow}</span> : null}
        {children}
      </section>
    </div>
  );
}
