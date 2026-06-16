import type { ChartStatus } from '@seta/planner';
import type { BarSeries, DonutSlice, LegendItem } from '@seta/shared-ui';

export type StatusKey = keyof ChartStatus;

export const STATUS_ORDER: readonly StatusKey[] = ['not_started', 'in_progress', 'completed'];

export const STATUS_LABEL: Record<StatusKey, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
};

// 3-status model matching the reference mock: neutral grey, Seta brand blue,
// success green. Late is surfaced as a KPI, not a chart segment.
export const STATUS_COLOR: Record<StatusKey, string> = {
  not_started: 'var(--color-ink-subtle)',
  in_progress: 'var(--color-primary)',
  completed: 'var(--color-success)',
};

/** Status mapped to the generic bar-chart series contract. */
export const STATUS_SERIES: BarSeries[] = STATUS_ORDER.map((k) => ({
  key: k,
  name: STATUS_LABEL[k],
  color: STATUS_COLOR[k],
}));

/** Status mapped to the generic legend contract. */
export const STATUS_LEGEND: LegendItem[] = STATUS_ORDER.map((k) => ({
  key: k,
  label: STATUS_LABEL[k],
  color: STATUS_COLOR[k],
}));

/** A status breakdown mapped to the generic donut-slice contract. */
export function statusSlices(b: ChartStatus): DonutSlice[] {
  return STATUS_ORDER.map((k) => ({
    key: k,
    name: STATUS_LABEL[k],
    value: b[k],
    color: STATUS_COLOR[k],
  }));
}

export function statusTotal(b: ChartStatus): number {
  return b.not_started + b.in_progress + b.completed;
}
