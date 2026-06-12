import type { StatusBreakdown } from '@seta/planner';

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

export const STATUS_COLOR: Record<StatusKey, string> = {
  not_started: 'var(--color-ink-subtle)',
  in_progress: 'var(--color-primary)',
  late: 'var(--color-danger)',
  completed: 'var(--color-success)',
  deferred: 'var(--color-warning)',
};

export function statusTotal(b: StatusBreakdown): number {
  return b.not_started + b.in_progress + b.late + b.completed + b.deferred;
}
