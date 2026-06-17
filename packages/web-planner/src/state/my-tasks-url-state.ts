import type { MyTasksFilters } from './query-keys';

const VALID_PRIORITIES = new Set([1, 3, 5, 9]);
const VALID_DUE = new Set(['overdue', 'this_week', 'no_date']);
const VALID_VIEW = new Set(['list', 'grid']);
const VALID_SORT = new Set(['assignee_priority', 'due_at']);

const DEFAULT_VIEW = 'list' as const;
const DEFAULT_SORT = 'assignee_priority' as const;

export function parseMyTasksSearch(search: Record<string, unknown>): MyTasksFilters {
  const result: MyTasksFilters = { view: DEFAULT_VIEW, sort: DEFAULT_SORT };

  if (typeof search.planId === 'string' && search.planId) {
    result.planId = search.planId;
  }
  if (typeof search.groupId === 'string' && search.groupId) {
    result.groupId = search.groupId;
  }

  const rawPriority = parseInt(String(search.priority ?? ''), 10);
  if (VALID_PRIORITIES.has(rawPriority)) {
    result.priority = rawPriority as 1 | 3 | 5 | 9;
  }

  const rawDue = search.due;
  if (typeof rawDue === 'string' && VALID_DUE.has(rawDue)) {
    result.due = rawDue as MyTasksFilters['due'];
  }

  const rawView = search.view;
  if (typeof rawView === 'string' && VALID_VIEW.has(rawView)) {
    result.view = rawView as 'list' | 'grid';
  }

  const rawSort = search.sort;
  if (typeof rawSort === 'string' && VALID_SORT.has(rawSort)) {
    result.sort = rawSort as 'assignee_priority' | 'due_at';
  }

  const rawSearch = search.q;
  if (typeof rawSearch === 'string' && rawSearch) {
    result.search = rawSearch;
  }

  return result;
}

export function serializeMyTasksSearch(filters: MyTasksFilters): Record<string, string | number> {
  const out: Record<string, string | number> = {};

  if (filters.planId) out.planId = filters.planId;
  if (filters.groupId) out.groupId = filters.groupId;
  if (filters.priority !== undefined) out.priority = filters.priority;
  if (filters.due) out.due = filters.due;
  // Omit defaults so the URL stays clean
  if (filters.view && filters.view !== DEFAULT_VIEW) out.view = filters.view;
  if (filters.sort && filters.sort !== DEFAULT_SORT) out.sort = filters.sort;
  if (filters.search) out.q = filters.search;

  return out;
}
