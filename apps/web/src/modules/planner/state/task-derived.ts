import type { TaskPriorityNumber } from '@seta/planner';

export type PriorityLabel = 'urgent' | 'important' | 'medium' | 'low';
export type ProgressLabel = 'not_started' | 'in_progress' | 'completed' | 'deferred';

const PRIORITY_TO_LABEL: Record<TaskPriorityNumber, PriorityLabel> = {
  1: 'urgent',
  3: 'important',
  5: 'medium',
  9: 'low',
};

const PRIORITY_FROM_LABEL: Record<PriorityLabel, TaskPriorityNumber> = {
  urgent: 1,
  important: 3,
  medium: 5,
  low: 9,
};

export function priorityLabel(n: TaskPriorityNumber | null | undefined): PriorityLabel {
  if (n == null) return 'medium';
  return PRIORITY_TO_LABEL[n] ?? 'medium';
}

export function priorityNumber(label: PriorityLabel): TaskPriorityNumber {
  return PRIORITY_FROM_LABEL[label];
}

export function progressLabel(input: {
  percent_complete: number;
  is_deferred: boolean;
}): ProgressLabel {
  if (input.is_deferred) return 'deferred';
  if (input.percent_complete >= 100) return 'completed';
  if (input.percent_complete > 0) return 'in_progress';
  return 'not_started';
}

export function progressLabelPatch(next: ProgressLabel): {
  percent_complete: number;
  is_deferred: boolean;
} {
  switch (next) {
    case 'completed':
      return { percent_complete: 100, is_deferred: false };
    case 'in_progress':
      return { percent_complete: 50, is_deferred: false };
    case 'deferred':
      return { percent_complete: 0, is_deferred: true };
    case 'not_started':
      return { percent_complete: 0, is_deferred: false };
  }
}

export function compareOrderHint(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}
