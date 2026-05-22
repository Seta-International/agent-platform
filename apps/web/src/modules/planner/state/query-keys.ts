import type { ListTasksFilters } from '@seta/planner';

export interface MyTasksFilters {
  planId?: string;
  groupId?: string;
  priority?: 1 | 3 | 5 | 9;
  due?: 'this_week' | 'overdue' | 'no_date';
  view?: 'list' | 'grid';
  search?: string;
  sort?: 'assignee_priority' | 'due_at';
}

function serializeFilters(f: Record<string, unknown>): string {
  const sortedKeys = Object.keys(f).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    const v = f[k];
    if (v === undefined) continue;
    sorted[k] = Array.isArray(v) ? v.toSorted() : v;
  }
  return JSON.stringify(sorted);
}

export const plannerKeys = {
  all: ['planner'] as const,
  groups: () => [...plannerKeys.all, 'groups'] as const,
  myGroups: () => [...plannerKeys.groups(), 'mine'] as const,
  groupsWithCounts: () => [...plannerKeys.groups(), 'withCounts'] as const,
  group: (id: string) => [...plannerKeys.groups(), id] as const,
  groupMembers: (id: string) => [...plannerKeys.group(id), 'members'] as const,
  groupActivity: (id: string, days: number) =>
    [...plannerKeys.group(id), 'activity', days] as const,
  groupPlans: (id: string) => [...plannerKeys.group(id), 'plans'] as const,
  groupPlansWithRollups: (id: string) =>
    [...plannerKeys.group(id), 'plans', 'withRollups'] as const,
  groupSyncStatus: (groupId: string) => [...plannerKeys.group(groupId), 'syncStatus'] as const,
  m365GroupSearch: (q: string) => [...plannerKeys.all, 'm365GroupSearch', q] as const,
  plan: (id: string) => [...plannerKeys.all, 'plan', id] as const,
  planLabels: (id: string) => [...plannerKeys.plan(id), 'labels'] as const,
  planCategories: (id: string) => [...plannerKeys.plan(id), 'categories'] as const,
  planTasks: (id: string, filters: ListTasksFilters) =>
    [
      ...plannerKeys.plan(id),
      'tasks',
      serializeFilters(filters as Record<string, unknown>),
    ] as const,
  planSyncStatus: (planId: string) => [...plannerKeys.plan(planId), 'syncStatus'] as const,
  planConflicts: (planId: string) => [...plannerKeys.plan(planId), 'conflicts'] as const,
  task: (id: string) => [...plannerKeys.all, 'task', id] as const,
  taskEvents: (id: string) => [...plannerKeys.task(id), 'events'] as const,
  taskChecklist: (id: string) => [...plannerKeys.task(id), 'checklist'] as const,
  taskSyncStatus: (taskId: string) => [...plannerKeys.task(taskId), 'syncStatus'] as const,
  myAssigned: () => [...plannerKeys.all, 'mine'] as const,
  myTasks: (filters: MyTasksFilters) =>
    [...plannerKeys.all, 'myTasks', serializeFilters(filters as Record<string, unknown>)] as const,
  trash: () => [...plannerKeys.all, 'trash'] as const,
} as const;
