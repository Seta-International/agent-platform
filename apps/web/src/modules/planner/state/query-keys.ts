import type { ListTasksFilters } from '@seta/planner';

function serializeFilters(f: ListTasksFilters): string {
  const sortedKeys = Object.keys(f).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    const v = (f as Record<string, unknown>)[k];
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
  groupPlans: (id: string) => [...plannerKeys.group(id), 'plans'] as const,
  groupSyncStatus: (groupId: string) => [...plannerKeys.group(groupId), 'syncStatus'] as const,
  m365GroupSearch: (q: string) => [...plannerKeys.all, 'm365GroupSearch', q] as const,
  plan: (id: string) => [...plannerKeys.all, 'plan', id] as const,
  planLabels: (id: string) => [...plannerKeys.plan(id), 'labels'] as const,
  planCategories: (id: string) => [...plannerKeys.plan(id), 'categories'] as const,
  planTasks: (id: string, filters: ListTasksFilters) =>
    [...plannerKeys.plan(id), 'tasks', serializeFilters(filters)] as const,
  task: (id: string) => [...plannerKeys.all, 'task', id] as const,
  taskEvents: (id: string) => [...plannerKeys.task(id), 'events'] as const,
  taskChecklist: (id: string) => [...plannerKeys.task(id), 'checklist'] as const,
  myAssigned: () => [...plannerKeys.all, 'mine'] as const,
  trash: () => [...plannerKeys.all, 'trash'] as const,
} as const;
