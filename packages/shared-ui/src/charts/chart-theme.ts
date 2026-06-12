// Generic, data-agnostic recharts surface styling pulled from design tokens so
// every chart (any module) stays on-theme in light and dark. No domain coupling.

export const CHART_TICK = { fill: 'var(--color-ink-subtle)', fontSize: 12 } as const;

export const CHART_AXIS_STROKE = 'var(--color-hairline)';

export const CHART_GRID_STROKE = 'var(--color-hairline)';

export const CHART_TOOLTIP_STYLE = {
  background: 'var(--color-canvas)',
  border: '1px solid var(--color-hairline)',
  borderRadius: 8,
  color: 'var(--color-ink)',
  fontSize: 12,
  boxShadow: 'var(--shadow-lg)',
} as const;

export const CHART_CURSOR_FILL = 'var(--color-surface-2)';
