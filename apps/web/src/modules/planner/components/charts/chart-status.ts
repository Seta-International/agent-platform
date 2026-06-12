import type { StatusBreakdown } from '@seta/planner';
import type { BarSeries, DonutSlice, LegendItem } from '@seta/shared-ui';

export type StatusKey = keyof StatusBreakdown;

export const STATUS_ORDER: readonly StatusKey[] = [
  'not_started',
  'in_progress',
  'late',
  'completed',
  'deferred',
];

export const STATUS_LABEL: Record<StatusKey, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  late: 'Late',
  completed: 'Completed',
  deferred: 'Deferred',
};

// Status hues map to the shared semantic tokens (DESIGN.md / tokens.css).
// `in_progress` uses the semantic `info` blue rather than `primary`, keeping
// Seta brand blue (#0047FF) reserved as the single brand accent.
export const STATUS_COLOR: Record<StatusKey, string> = {
  not_started: 'var(--color-ink-subtle)',
  in_progress: 'var(--color-info)',
  late: 'var(--color-danger)',
  completed: 'var(--color-success)',
  deferred: 'var(--color-warning)',
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
export function statusSlices(b: StatusBreakdown): DonutSlice[] {
  return STATUS_ORDER.map((k) => ({
    key: k,
    name: STATUS_LABEL[k],
    value: b[k],
    color: STATUS_COLOR[k],
  }));
}

export function statusTotal(b: StatusBreakdown): number {
  return b.not_started + b.in_progress + b.late + b.completed + b.deferred;
}
