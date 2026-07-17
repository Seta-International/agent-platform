import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';

// The mesh sits in a 108%-sized SVG offset by -4%, so this ±1.2% drift can never
// pull an edge into view. Transform-only, so it stays on the compositor.
const drift = stylex.keyframes({
  '0%': { transform: 'translate3d(-1.2%, -0.8%, 0)' },
  '50%': { transform: 'translate3d(1.2%, 0.8%, 0)' },
  '100%': { transform: 'translate3d(-1.2%, -0.8%, 0)' },
});

const styles = stylex.create({
  root: { position: 'relative', isolation: 'isolate' },
  mesh: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    // Dissolves the mesh well before it reaches the 400px card, so the form keeps
    // a clean canvas and the constellation only survives out at the margins.
    maskImage:
      'radial-gradient(ellipse 58% 52% at 50% 50%, transparent 0%, transparent 26%, rgba(0, 0, 0, 0.45) 52%, #000 82%)',
  },
  drifting: {
    position: 'absolute',
    top: '-4%',
    left: '-4%',
    width: '108%',
    height: '108%',
    animationName: { default: drift, '@media (prefers-reduced-motion: reduce)': 'none' },
    animationDuration: '48s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  },
  // Both operands are theme tokens, so mixing the brand ink *into the canvas* lands
  // a near-background colour in either theme — no media query, no per-theme opacity.
  edges: {
    fill: 'none',
    stroke: 'color-mix(in oklch, var(--color-primary-ink) 18%, var(--color-canvas))',
    strokeWidth: 1,
  },
  nodes: {
    stroke: 'none',
    fill: 'color-mix(in oklch, var(--color-primary-ink) 40%, var(--color-canvas))',
  },
  content: { position: 'relative', zIndex: 1 },
});

/** Node centres in the 1200×800 viewBox; `r` marks the handful of hub nodes. */
const NODES: ReadonlyArray<{ x: number; y: number; r: number }> = [
  { x: 90, y: 120, r: 2 },
  { x: 250, y: 60, r: 2.5 },
  { x: 300, y: 230, r: 3 },
  { x: 140, y: 330, r: 2 },
  { x: 60, y: 520, r: 2.5 },
  { x: 210, y: 620, r: 2 },
  { x: 380, y: 460, r: 3 },
  { x: 330, y: 720, r: 2 },
  { x: 520, y: 150, r: 2.5 },
  { x: 560, y: 350, r: 2 },
  { x: 500, y: 620, r: 2.5 },
  { x: 700, y: 90, r: 2 },
  { x: 680, y: 300, r: 2 },
  { x: 720, y: 560, r: 2.5 },
  { x: 640, y: 740, r: 2 },
  { x: 860, y: 200, r: 3 },
  { x: 900, y: 420, r: 2 },
  { x: 830, y: 660, r: 2.5 },
  { x: 1040, y: 120, r: 2 },
  { x: 1090, y: 330, r: 2.5 },
  { x: 1010, y: 570, r: 2 },
  { x: 1140, y: 700, r: 2 },
  { x: 1150, y: 480, r: 3 },
  { x: 420, y: 300, r: 2 },
];

/** Index pairs into NODES — only near neighbours, so the graph reads as a mesh. */
const EDGE_INDICES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, 3],
  [1, 2],
  [2, 3],
  [2, 23],
  [3, 4],
  [4, 5],
  [5, 7],
  [5, 6],
  [6, 23],
  [6, 10],
  [7, 10],
  [23, 8],
  [23, 9],
  [8, 9],
  [8, 11],
  [9, 12],
  [9, 6],
  [10, 13],
  [10, 14],
  [11, 12],
  [11, 15],
  [12, 15],
  [12, 13],
  [13, 16],
  [13, 17],
  [14, 17],
  [15, 16],
  [15, 18],
  [16, 19],
  [16, 22],
  [17, 20],
  [18, 19],
  [19, 22],
  [20, 22],
  [20, 21],
  [21, 22],
];

/** Resolved once at module scope: the render path stays a plain map over real points. */
const EDGES = EDGE_INDICES.flatMap(([fromIndex, toIndex]) => {
  const from = NODES[fromIndex];
  const to = NODES[toIndex];
  return from && to ? [{ key: `${fromIndex}-${toIndex}`, from, to }] : [];
});

export interface AuthBackdropProps {
  children: ReactNode;
}

/**
 * Atmospheric backdrop for the auth screens: a faint, slowly drifting node-and-edge
 * constellation suggesting agents and their connections. Purely decorative — it is
 * hidden from assistive tech, never takes pointer events, and sits behind `children`.
 */
export function AuthBackdrop({ children }: AuthBackdropProps) {
  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.mesh)}>
        {/* aria-hidden lives on the svg — the layer's only content — so the whole
            decoration leaves the a11y tree without hiding anything else. */}
        <svg
          {...stylex.props(styles.drifting)}
          viewBox="0 0 1200 800"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
          focusable="false"
        >
          <g {...stylex.props(styles.edges)}>
            {EDGES.map(({ key, from, to }) => (
              <line key={key} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
            ))}
          </g>
          <g {...stylex.props(styles.nodes)}>
            {NODES.map((node) => (
              <circle key={`${node.x}-${node.y}`} cx={node.x} cy={node.y} r={node.r} />
            ))}
          </g>
        </svg>
      </div>
      <div {...stylex.props(styles.content)}>{children}</div>
    </div>
  );
}
