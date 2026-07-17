// Generic, data-agnostic recharts surface styling pulled from design tokens so
// every chart (any module) stays on-theme in light and dark. No domain coupling.

export const CHART_TICK = { fill: 'var(--color-text-secondary)', fontSize: 12 } as const;

export const CHART_AXIS_STROKE = 'var(--color-border)';

export const CHART_GRID_STROKE = 'var(--color-border)';

export const CHART_TOOLTIP_STYLE = {
  background: 'var(--color-background-body)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  color: 'var(--color-text-primary)',
  fontSize: 12,
  boxShadow: 'var(--shadow-lg)',
} as const;

export const CHART_CURSOR_FILL = 'var(--color-background-surface)';
