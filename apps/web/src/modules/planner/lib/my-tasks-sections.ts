import type { MyTasksResult } from '@seta/planner';
import type { SectionKey, SectionTone } from '../components/my-tasks/types';

export interface SectionSpec {
  key: SectionKey;
  label: string;
  tone: SectionTone;
  bucket: keyof MyTasksResult;
  hint?: string;
  defaultOpen: boolean;
}

export const SECTION_SPECS: ReadonlyArray<SectionSpec> = [
  { key: 'late', label: 'Late', tone: 'danger', bucket: 'late', defaultOpen: true },
  {
    key: 'week',
    label: 'Due this week',
    tone: 'warning',
    bucket: 'dueThisWeek',
    defaultOpen: true,
  },
  {
    key: 'in_progress',
    label: 'In progress',
    tone: 'primary',
    bucket: 'inProgress',
    defaultOpen: false,
  },
  {
    key: 'not_started',
    label: 'Not started',
    tone: 'muted',
    bucket: 'notStarted',
    defaultOpen: false,
  },
  {
    key: 'done',
    label: 'Recently completed',
    tone: 'success',
    bucket: 'recentlyCompleted',
    defaultOpen: false,
    hint: 'last 14 days',
  },
];

export function findNeighbors(
  data: MyTasksResult,
  droppableId: string,
  taskId: string,
  index: number,
): { prev: string | null; next: string | null } {
  const parts = droppableId.split(':');
  if (parts.length !== 3) return { prev: null, next: null };
  const sectionKey = parts[1] as SectionKey;
  const planId = parts[2];
  const spec = SECTION_SPECS.find((s) => s.key === sectionKey);
  if (!spec) return { prev: null, next: null };
  const tasks = data[spec.bucket].filter((t) => t.plan.id === planId && t.id !== taskId);
  return {
    prev: tasks[index - 1]?.assignee_priority ?? null,
    next: tasks[index]?.assignee_priority ?? null,
  };
}
