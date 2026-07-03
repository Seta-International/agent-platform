// Drizzle-boundary mapping between the storage-level enums (`tasks.progress` /
// `tasks.priority`) and the M365-parity numeric fields the DTOs, web-planner,
// agent tools, and M365 sync payloads have always spoken (percent_complete /
// priority_number). Every read/write through `tasks` converts here so the
// public contract never sees the enum.
import type { TASK_PRIORITIES, TASK_PROGRESS } from './schema.ts';

export type TaskProgress = (typeof TASK_PROGRESS)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

const PROGRESS_TO_PERCENT: Record<TaskProgress, 0 | 50 | 100> = {
  not_started: 0,
  in_progress: 50,
  done: 100,
};

export function progressToPercent(p: TaskProgress): 0 | 50 | 100 {
  return PROGRESS_TO_PERCENT[p];
}

export function percentToProgress(n: number): TaskProgress {
  if (n === 0) return 'not_started';
  if (n === 100) return 'done';
  return 'in_progress';
}

const PRIORITY_TO_NUMBER: Record<TaskPriority, 1 | 3 | 5 | 9> = {
  urgent: 1,
  important: 3,
  medium: 5,
  low: 9,
};

export function priorityToNumber(p: TaskPriority): 1 | 3 | 5 | 9 {
  return PRIORITY_TO_NUMBER[p];
}

export function numberToPriority(n: number): TaskPriority {
  if (n === 1) return 'urgent';
  if (n === 3) return 'important';
  if (n === 9) return 'low';
  return 'medium';
}
