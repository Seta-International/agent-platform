import type { GroupRow, PlanRow, TaskWithAssigneesRow } from '@seta/planner';

export function makeGroup(over: Partial<GroupRow> = {}): GroupRow {
  return {
    id: 'g1',
    tenant_id: 't',
    name: 'Engineering',
    account_id: null,
    created_by: 'u',
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-10T00:00:00Z',
    deleted_at: null,
    version: 1,
    ...over,
  };
}

export function makePlan(over: Partial<PlanRow> = {}): PlanRow {
  return {
    id: 'p1',
    tenant_id: 't',
    group_id: 'g1',
    name: 'Q3 Launch',
    created_by: 'u',
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-10T00:00:00Z',
    deleted_at: null,
    version: 1,
    ...over,
  };
}

export function makeTaskWithAssignees(
  over: Partial<TaskWithAssigneesRow> = {},
): TaskWithAssigneesRow {
  return {
    id: 't1',
    tenant_id: 't',
    plan_id: 'p1',
    bucket_id: null,
    title: 'Task',
    description: null,
    priority: 'medium',
    progress: 'not_started',
    review_state: null,
    skill_tags: [],
    due_at: null,
    sort_order: 1,
    created_by: 'u',
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    deleted_at: null,
    version: 1,
    assignees: [],
    labels: [],
    checklist_summary: { total: 0, checked: 0 },
    ...over,
  };
}
