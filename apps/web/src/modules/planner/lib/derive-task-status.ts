import type { TaskRow } from '@seta/planner';

export type DerivedTaskStatus = 'Not started' | 'In Progress' | 'Done' | 'Deferred';

export function deriveTaskStatus(
  task: Pick<TaskRow, 'percent_complete' | 'is_deferred'>,
): DerivedTaskStatus {
  if (task.percent_complete === 100) return 'Done';
  if (task.is_deferred) return 'Deferred';
  if (task.percent_complete === 0) return 'Not started';
  return 'In Progress';
}
