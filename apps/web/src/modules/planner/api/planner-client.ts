import type {
  BucketRow,
  ChecklistItemRow,
  GroupMemberRow,
  GroupRow,
  LabelRow,
  ListTasksFilters,
  PersistedPlannerEvent,
  PlanRow,
  TaskRow,
  TaskWithAssigneesRow,
} from '@seta/planner';

export class PlannerClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: Record<string, unknown>;

  constructor(status: number, code: string, body: Record<string, unknown>, message?: string) {
    super(message ?? `${status} ${code}`);
    this.name = 'PlannerClientError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T | undefined> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
  if (res.status === 204) return undefined;
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const code = typeof body.error === 'string' ? body.error : `HTTP_${res.status}`;
    throw new PlannerClientError(
      res.status,
      code,
      body,
      typeof body.message === 'string' ? body.message : undefined,
    );
  }
  return body as T;
}

async function listGroups(): Promise<GroupRow[]> {
  const r = (await request<{ groups: GroupRow[] }>(`/api/planner/v1/groups`)) ?? { groups: [] };
  return r.groups;
}

async function listMyGroups(): Promise<GroupRow[]> {
  const r = (await request<{ groups: GroupRow[] }>(`/api/planner/v1/groups/mine`)) ?? {
    groups: [],
  };
  return r.groups;
}

async function getGroup(group_id: string): Promise<GroupRow> {
  return (await request<GroupRow>(`/api/planner/v1/groups/${group_id}`)) as GroupRow;
}

async function createGroup(input: { name: string }): Promise<GroupRow> {
  return (await request<GroupRow>(`/api/planner/v1/groups`, {
    method: 'POST',
    body: JSON.stringify(input),
  })) as GroupRow;
}

async function updateGroup(input: {
  group_id: string;
  expected_version: number;
  patch: { name?: string };
}): Promise<GroupRow> {
  return (await request<GroupRow>(`/api/planner/v1/groups/${input.group_id}`, {
    method: 'PATCH',
    body: JSON.stringify({ expected_version: input.expected_version, patch: input.patch }),
  })) as GroupRow;
}

async function deleteGroup(input: { group_id: string; expected_version: number }): Promise<void> {
  await request<void>(`/api/planner/v1/groups/${input.group_id}`, {
    method: 'DELETE',
    body: JSON.stringify({ expected_version: input.expected_version }),
  });
}

async function restoreGroup(input: { group_id: string }): Promise<GroupRow> {
  return (await request<GroupRow>(`/api/planner/v1/groups/${input.group_id}/restore`, {
    method: 'POST',
  })) as GroupRow;
}

async function listGroupMembers(group_id: string): Promise<GroupMemberRow[]> {
  const r = (await request<{ members: GroupMemberRow[] }>(
    `/api/planner/v1/groups/${group_id}/members`,
  )) ?? { members: [] };
  return r.members;
}

async function addGroupMember(input: { group_id: string; user_id: string }): Promise<void> {
  await request<void>(`/api/planner/v1/groups/${input.group_id}/members`, {
    method: 'POST',
    body: JSON.stringify({ user_id: input.user_id }),
  });
}

async function removeGroupMember(input: { group_id: string; user_id: string }): Promise<void> {
  await request<void>(`/api/planner/v1/groups/${input.group_id}/members/${input.user_id}`, {
    method: 'DELETE',
  });
}

async function listPlans(
  input: { group_id?: string; include_deleted?: boolean } = {},
): Promise<PlanRow[]> {
  const q = new URLSearchParams();
  if (input.group_id) q.set('group_id', input.group_id);
  if (input.include_deleted) q.set('include_deleted', 'true');
  const r = (await request<{ plans: PlanRow[] }>(
    `/api/planner/v1/plans${q.toString() ? `?${q}` : ''}`,
  )) ?? { plans: [] };
  return r.plans;
}

async function getPlan(plan_id: string): Promise<PlanRow> {
  return (await request<PlanRow>(`/api/planner/v1/plans/${plan_id}`)) as PlanRow;
}

async function createPlan(input: { group_id: string; name: string }): Promise<PlanRow> {
  return (await request<PlanRow>(`/api/planner/v1/plans`, {
    method: 'POST',
    body: JSON.stringify(input),
  })) as PlanRow;
}

async function updatePlan(input: {
  plan_id: string;
  expected_version: number;
  patch: { name?: string };
}): Promise<PlanRow> {
  return (await request<PlanRow>(`/api/planner/v1/plans/${input.plan_id}`, {
    method: 'PATCH',
    body: JSON.stringify({ expected_version: input.expected_version, patch: input.patch }),
  })) as PlanRow;
}

async function deletePlan(input: { plan_id: string; expected_version: number }): Promise<void> {
  await request<void>(`/api/planner/v1/plans/${input.plan_id}`, {
    method: 'DELETE',
    body: JSON.stringify({ expected_version: input.expected_version }),
  });
}

async function restorePlan(input: { plan_id: string }): Promise<PlanRow> {
  return (await request<PlanRow>(`/api/planner/v1/plans/${input.plan_id}/restore`, {
    method: 'POST',
  })) as PlanRow;
}

async function listLabels(plan_id: string, include_deleted = false): Promise<LabelRow[]> {
  const q = new URLSearchParams();
  if (include_deleted) q.set('include_deleted', 'true');
  const r = (await request<{ labels: LabelRow[] }>(
    `/api/planner/v1/plans/${plan_id}/labels${q.toString() ? `?${q}` : ''}`,
  )) ?? { labels: [] };
  return r.labels;
}

async function createLabel(input: {
  plan_id: string;
  name: string;
  color: string;
}): Promise<LabelRow> {
  return (await request<LabelRow>(`/api/planner/v1/plans/${input.plan_id}/labels`, {
    method: 'POST',
    body: JSON.stringify({ name: input.name, color: input.color }),
  })) as LabelRow;
}

async function updateLabel(input: {
  label_id: string;
  patch: { name?: string; color?: string };
}): Promise<LabelRow> {
  return (await request<LabelRow>(`/api/planner/v1/labels/${input.label_id}`, {
    method: 'PATCH',
    body: JSON.stringify({ patch: input.patch }),
  })) as LabelRow;
}

async function deleteLabel(input: { label_id: string }): Promise<void> {
  await request<void>(`/api/planner/v1/labels/${input.label_id}`, { method: 'DELETE' });
}

async function listBuckets(plan_id: string, include_deleted = false): Promise<BucketRow[]> {
  const q = new URLSearchParams();
  if (include_deleted) q.set('include_deleted', 'true');
  const r = (await request<{ buckets: BucketRow[] }>(
    `/api/planner/v1/plans/${plan_id}/buckets${q.toString() ? `?${q}` : ''}`,
  )) ?? { buckets: [] };
  return r.buckets;
}

async function createBucket(input: {
  plan_id: string;
  name: string;
  after_bucket_id?: string;
}): Promise<BucketRow> {
  return (await request<BucketRow>(`/api/planner/v1/buckets`, {
    method: 'POST',
    body: JSON.stringify(input),
  })) as BucketRow;
}

async function updateBucket(input: {
  bucket_id: string;
  expected_version: number;
  patch: { name?: string };
}): Promise<BucketRow> {
  return (await request<BucketRow>(`/api/planner/v1/buckets/${input.bucket_id}`, {
    method: 'PATCH',
    body: JSON.stringify({ expected_version: input.expected_version, patch: input.patch }),
  })) as BucketRow;
}

async function reorderBucket(input: {
  bucket_id: string;
  expected_version: number;
  after_bucket_id?: string;
}): Promise<BucketRow> {
  return (await request<BucketRow>(`/api/planner/v1/buckets/${input.bucket_id}/reorder`, {
    method: 'POST',
    body: JSON.stringify({
      expected_version: input.expected_version,
      after_bucket_id: input.after_bucket_id,
    }),
  })) as BucketRow;
}

async function deleteBucket(input: { bucket_id: string; expected_version: number }): Promise<void> {
  await request<void>(`/api/planner/v1/buckets/${input.bucket_id}`, {
    method: 'DELETE',
    body: JSON.stringify({ expected_version: input.expected_version }),
  });
}

async function listTasks(
  filters: ListTasksFilters & { limit?: number; cursor?: string } = {},
): Promise<{ tasks: TaskWithAssigneesRow[]; next_cursor?: string }> {
  const q = new URLSearchParams();
  if (filters.plan_id) q.set('plan_id', filters.plan_id);
  if (filters.group_id) q.set('group_id', filters.group_id);
  if (filters.bucket_id) q.set('bucket_id', filters.bucket_id);
  if (filters.assignee_id) q.set('assignee_id', filters.assignee_id);
  if (filters.review_state) q.set('review_state', filters.review_state);
  if (filters.progress) q.set('progress', filters.progress);
  if (filters.due_before) q.set('due_before', filters.due_before);
  if (filters.skill_tags?.length) q.set('skill_tags', filters.skill_tags.join(','));
  if (filters.include_deleted) q.set('include_deleted', 'true');
  if (filters.limit) q.set('limit', String(filters.limit));
  if (filters.cursor) q.set('cursor', filters.cursor);
  return (await request<{ tasks: TaskWithAssigneesRow[]; next_cursor?: string }>(
    `/api/planner/v1/tasks${q.toString() ? `?${q}` : ''}`,
  )) as { tasks: TaskWithAssigneesRow[]; next_cursor?: string };
}

async function listMyAssignedTasks(
  filters: {
    limit?: number;
    cursor?: string;
    review_state?: 'needs_review';
    progress?: TaskRow['progress'];
    due_before?: string;
    include_deleted?: boolean;
  } = {},
): Promise<{ tasks: TaskWithAssigneesRow[]; next_cursor?: string }> {
  const q = new URLSearchParams();
  if (filters.review_state) q.set('review_state', filters.review_state);
  if (filters.progress) q.set('progress', filters.progress);
  if (filters.due_before) q.set('due_before', filters.due_before);
  if (filters.include_deleted) q.set('include_deleted', 'true');
  if (filters.limit) q.set('limit', String(filters.limit));
  if (filters.cursor) q.set('cursor', filters.cursor);
  return (await request<{ tasks: TaskWithAssigneesRow[]; next_cursor?: string }>(
    `/api/planner/v1/tasks/mine${q.toString() ? `?${q}` : ''}`,
  )) as { tasks: TaskWithAssigneesRow[]; next_cursor?: string };
}

async function getTask(task_id: string): Promise<TaskWithAssigneesRow> {
  return (await request<TaskWithAssigneesRow>(
    `/api/planner/v1/tasks/${task_id}`,
  )) as TaskWithAssigneesRow;
}

async function createTask(input: {
  plan_id: string;
  bucket_id?: string;
  title: string;
  description?: string;
  priority?: TaskRow['priority'];
  due_at?: string;
  skill_tags?: string[];
  review_state?: 'needs_review';
}): Promise<TaskRow> {
  return (await request<TaskRow>(`/api/planner/v1/tasks`, {
    method: 'POST',
    body: JSON.stringify(input),
  })) as TaskRow;
}

async function updateTask(input: {
  task_id: string;
  expected_version: number;
  patch: Partial<
    Pick<TaskRow, 'title' | 'description' | 'priority' | 'due_at' | 'skill_tags' | 'review_state'>
  >;
}): Promise<TaskRow> {
  return (await request<TaskRow>(`/api/planner/v1/tasks/${input.task_id}`, {
    method: 'PATCH',
    body: JSON.stringify({ expected_version: input.expected_version, patch: input.patch }),
  })) as TaskRow;
}

async function moveTask(input: {
  task_id: string;
  expected_version: number;
  to_bucket_id: string | null;
  after_task_id?: string;
}): Promise<TaskRow> {
  return (await request<TaskRow>(`/api/planner/v1/tasks/${input.task_id}/move`, {
    method: 'POST',
    body: JSON.stringify({
      expected_version: input.expected_version,
      to_bucket_id: input.to_bucket_id,
      after_task_id: input.after_task_id,
    }),
  })) as TaskRow;
}

async function assignTask(input: { task_id: string; user_id: string }): Promise<void> {
  await request<void>(`/api/planner/v1/tasks/${input.task_id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ user_id: input.user_id }),
  });
}

async function unassignTask(input: { task_id: string; user_id: string }): Promise<void> {
  await request<void>(`/api/planner/v1/tasks/${input.task_id}/assignees/${input.user_id}`, {
    method: 'DELETE',
  });
}

async function completeTask(input: {
  task_id: string;
  expected_version: number;
}): Promise<TaskRow> {
  return (await request<TaskRow>(`/api/planner/v1/tasks/${input.task_id}/complete`, {
    method: 'POST',
    body: JSON.stringify({ expected_version: input.expected_version }),
  })) as TaskRow;
}

async function reopenTask(input: { task_id: string; expected_version: number }): Promise<TaskRow> {
  return (await request<TaskRow>(`/api/planner/v1/tasks/${input.task_id}/reopen`, {
    method: 'POST',
    body: JSON.stringify({ expected_version: input.expected_version }),
  })) as TaskRow;
}

async function deleteTask(input: { task_id: string; expected_version: number }): Promise<void> {
  await request<void>(`/api/planner/v1/tasks/${input.task_id}`, {
    method: 'DELETE',
    body: JSON.stringify({ expected_version: input.expected_version }),
  });
}

async function restoreTask(input: { task_id: string }): Promise<TaskRow> {
  return (await request<TaskRow>(`/api/planner/v1/tasks/${input.task_id}/restore`, {
    method: 'POST',
  })) as TaskRow;
}

async function applyLabel(input: { task_id: string; label_id: string }): Promise<void> {
  await request<void>(`/api/planner/v1/tasks/${input.task_id}/labels`, {
    method: 'POST',
    body: JSON.stringify({ label_id: input.label_id }),
  });
}

async function unapplyLabel(input: { task_id: string; label_id: string }): Promise<void> {
  await request<void>(`/api/planner/v1/tasks/${input.task_id}/labels/${input.label_id}`, {
    method: 'DELETE',
  });
}

async function listChecklistItems(task_id: string): Promise<ChecklistItemRow[]> {
  const r = (await request<{ items: ChecklistItemRow[] }>(
    `/api/planner/v1/tasks/${task_id}/checklist`,
  )) ?? { items: [] };
  return r.items;
}

async function addChecklistItem(input: {
  task_id: string;
  label: string;
  after_item_id?: string;
}): Promise<ChecklistItemRow> {
  return (await request<ChecklistItemRow>(`/api/planner/v1/tasks/${input.task_id}/checklist`, {
    method: 'POST',
    body: JSON.stringify({ label: input.label, after_item_id: input.after_item_id }),
  })) as ChecklistItemRow;
}

async function updateChecklistItem(input: {
  item_id: string;
  patch: { label?: string; checked?: boolean };
}): Promise<ChecklistItemRow> {
  return (await request<ChecklistItemRow>(`/api/planner/v1/checklist-items/${input.item_id}`, {
    method: 'PATCH',
    body: JSON.stringify({ patch: input.patch }),
  })) as ChecklistItemRow;
}

async function removeChecklistItem(input: { item_id: string }): Promise<void> {
  await request<void>(`/api/planner/v1/checklist-items/${input.item_id}`, { method: 'DELETE' });
}

async function listTaskEvents(input: {
  task_id: string;
  limit?: number;
  cursor?: string;
}): Promise<{ events: PersistedPlannerEvent[]; next_cursor?: string }> {
  const q = new URLSearchParams();
  if (input.limit) q.set('limit', String(input.limit));
  if (input.cursor) q.set('cursor', input.cursor);
  return (await request<{ events: PersistedPlannerEvent[]; next_cursor?: string }>(
    `/api/planner/v1/tasks/${input.task_id}/events${q.toString() ? `?${q}` : ''}`,
  )) as { events: PersistedPlannerEvent[]; next_cursor?: string };
}

export const plannerClient = {
  listGroups,
  listMyGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  restoreGroup,
  listGroupMembers,
  addGroupMember,
  removeGroupMember,
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
  restorePlan,
  listLabels,
  createLabel,
  updateLabel,
  deleteLabel,
  listBuckets,
  createBucket,
  updateBucket,
  reorderBucket,
  deleteBucket,
  listTasks,
  listMyAssignedTasks,
  getTask,
  createTask,
  updateTask,
  moveTask,
  assignTask,
  unassignTask,
  completeTask,
  reopenTask,
  deleteTask,
  restoreTask,
  applyLabel,
  unapplyLabel,
  listChecklistItems,
  addChecklistItem,
  updateChecklistItem,
  removeChecklistItem,
  listTaskEvents,
} as const;
