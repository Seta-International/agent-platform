import type {
  BucketRow,
  ChecklistItemRow,
  CommentDto,
  CommentListResult,
  GroupActivityResult,
  GroupMemberRow,
  GroupRow,
  GroupSyncStatus,
  GroupWithCountsRow,
  LabelRow,
  ListTasksFilters,
  MyTasksResult,
  PersistedPlannerEvent,
  PlanRow,
  PlanWithRollupsRow,
  TaskDetailRow,
  TaskReferenceRow,
  TaskReferenceType,
  TaskRow,
  TaskWithAssigneesRow,
} from '@seta/planner';

type M365GroupSearchResult = { external_id: string; display_name: string; mail_nickname: string };

export interface GroupJoinRequestRow {
  group_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  display_name: string;
  email: string;
}

export interface DiscoverGroupsItem {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  owner_display_name: string | null;
  owner_email: string | null;
}

export type GroupSyncStatusResponse =
  | { sync_status: null }
  | { sync_status: GroupSyncStatus; synced_at: string | null; last_error: string | null };

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

async function listGroupsWithCounts(
  opts: { includeDeleted?: boolean } = {},
): Promise<GroupWithCountsRow[]> {
  const q = new URLSearchParams({ withCounts: 'true' });
  if (opts.includeDeleted) q.set('include_deleted', 'true');
  const r = (await request<{ groups: GroupWithCountsRow[] }>(
    `/api/planner/v1/groups?${q.toString()}`,
  )) ?? { groups: [] };
  return r.groups;
}

async function listMyGroups(): Promise<GroupRow[]> {
  const r = (await request<{ groups: GroupRow[] }>(`/api/planner/v1/groups/mine`)) ?? {
    groups: [],
  };
  return r.groups;
}

async function getGroup(
  group_id: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<GroupRow> {
  const q = opts.includeDeleted ? '?include_deleted=true' : '';
  return (await request<GroupRow>(`/api/planner/v1/groups/${group_id}${q}`)) as GroupRow;
}

async function getGroupActivity(
  group_id: string,
  opts: { since?: string; limit?: number } = {},
): Promise<GroupActivityResult> {
  const q = new URLSearchParams();
  if (opts.since) q.set('since', opts.since);
  if (opts.limit !== undefined) q.set('limit', String(opts.limit));
  return (await request<GroupActivityResult>(
    `/api/planner/v1/groups/${group_id}/activity${q.toString() ? `?${q}` : ''}`,
  )) as GroupActivityResult;
}

async function createGroup(input: {
  name: string;
  description?: string;
  theme?: 'teal' | 'purple' | 'green' | 'blue' | 'pink' | 'orange' | 'red';
  visibility?: 'private' | 'public';
  default_role?: 'owner' | 'member';
}): Promise<GroupRow> {
  return (await request<GroupRow>(`/api/planner/v1/groups`, {
    method: 'POST',
    body: JSON.stringify(input),
  })) as GroupRow;
}

async function updateGroup(input: {
  group_id: string;
  expected_version: number;
  patch: {
    name?: string;
    description?: string | null;
    theme?: 'teal' | 'purple' | 'green' | 'blue' | 'pink' | 'orange' | 'red';
    visibility?: 'private' | 'public';
    default_role?: 'owner' | 'member';
  };
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

async function listGroupMembers(
  group_id: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ members: GroupMemberRow[]; total: number }> {
  const q = new URLSearchParams();
  if (opts?.limit !== undefined) q.set('limit', String(opts.limit));
  if (opts?.offset !== undefined) q.set('offset', String(opts.offset));
  const qs = q.toString();
  const r = (await request<{ members: GroupMemberRow[]; total: number }>(
    `/api/planner/v1/groups/${group_id}/members${qs ? `?${qs}` : ''}`,
  )) ?? { members: [], total: 0 };
  return r;
}

async function listGroupMemberCandidates(input: {
  group_id: string;
  search?: string;
  limit?: number;
}): Promise<{ candidates: { user_id: string; display_name: string; email: string }[] }> {
  const q = new URLSearchParams();
  if (input.search) q.set('search', input.search);
  if (input.limit !== undefined) q.set('limit', String(input.limit));
  return (await request<{
    candidates: { user_id: string; display_name: string; email: string }[];
  }>(
    `/api/planner/v1/groups/${input.group_id}/members/candidates${q.toString() ? `?${q}` : ''}`,
  )) as { candidates: { user_id: string; display_name: string; email: string }[] };
}

async function addGroupMembersBulk(input: {
  group_id: string;
  members: { user_id: string }[];
}): Promise<{ status: 201; members: GroupMemberRow[] } | { status: 202; job_id: string }> {
  const res = await fetch(`/api/planner/v1/groups/${input.group_id}/members/bulk`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ members: input.members }),
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const code = typeof body.error === 'string' ? body.error : `HTTP_${res.status}`;
    throw new PlannerClientError(res.status, code, body);
  }
  if (res.status === 202) {
    return { status: 202, job_id: body.job_id as string };
  }
  return { status: 201, members: body.members as GroupMemberRow[] };
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

async function setMemberRole(input: {
  group_id: string;
  user_id: string;
  role: 'owner' | 'member';
}): Promise<void> {
  await request<void>(`/api/planner/v1/groups/${input.group_id}/members/${input.user_id}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role: input.role }),
  });
}

export async function discoverGroups(q: string): Promise<DiscoverGroupsItem[]> {
  const r = await request<{ groups: DiscoverGroupsItem[] }>(
    `/api/planner/v1/groups/discover?q=${encodeURIComponent(q)}`,
  );
  return r?.groups ?? [];
}

export async function createJoinRequest(group_id: string): Promise<GroupJoinRequestRow> {
  return (await request<GroupJoinRequestRow>(`/api/planner/v1/groups/${group_id}/join-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })) as GroupJoinRequestRow;
}

export async function listJoinRequests(
  group_id: string,
  status?: 'pending' | 'approved' | 'rejected',
): Promise<GroupJoinRequestRow[]> {
  const qs = status ? `?status=${status}` : '';
  const r = await request<{ requests: GroupJoinRequestRow[] }>(
    `/api/planner/v1/groups/${group_id}/join-requests${qs}`,
  );
  return r?.requests ?? [];
}

export async function resolveJoinRequest(
  group_id: string,
  user_id: string,
  action: 'approved' | 'rejected',
): Promise<GroupJoinRequestRow> {
  return (await request<GroupJoinRequestRow>(
    `/api/planner/v1/groups/${group_id}/join-requests/${user_id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    },
  )) as GroupJoinRequestRow;
}

async function listPlans(
  input: { group_id?: string; include_deleted?: boolean; withRollups?: boolean } = {},
): Promise<PlanRow[]> {
  const q = new URLSearchParams();
  if (input.group_id) q.set('group_id', input.group_id);
  if (input.include_deleted) q.set('include_deleted', 'true');
  if (input.withRollups) q.set('withRollups', 'true');
  const r = (await request<{ plans: PlanRow[] }>(
    `/api/planner/v1/plans${q.toString() ? `?${q}` : ''}`,
  )) ?? { plans: [] };
  return r.plans;
}

async function listGroupPlansWithRollups(group_id: string): Promise<PlanWithRollupsRow[]> {
  const r = (await request<{ plans: PlanWithRollupsRow[] }>(
    `/api/planner/v1/plans?group_id=${group_id}&withRollups=true`,
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

async function moveBucket(input: {
  plan_id: string;
  bucket_id: string;
  before_id?: string;
  after_id?: string;
}): Promise<BucketRow> {
  return (await request<BucketRow>(`/api/planner/v1/buckets/${input.bucket_id}/move`, {
    method: 'POST',
    body: JSON.stringify({
      plan_id: input.plan_id,
      before_id: input.before_id,
      after_id: input.after_id,
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
  if (filters.is_deferred !== undefined) q.set('is_deferred', String(filters.is_deferred));
  if (filters.percent_complete_lt !== undefined)
    q.set('percent_complete_lt', String(filters.percent_complete_lt));
  if (filters.percent_complete_gte !== undefined)
    q.set('percent_complete_gte', String(filters.percent_complete_gte));
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
    is_deferred?: boolean;
    percent_complete_lt?: number;
    percent_complete_gte?: number;
    due_before?: string;
    include_deleted?: boolean;
  } = {},
): Promise<{ tasks: TaskWithAssigneesRow[]; next_cursor?: string }> {
  const q = new URLSearchParams();
  if (filters.review_state) q.set('review_state', filters.review_state);
  if (filters.is_deferred !== undefined) q.set('is_deferred', String(filters.is_deferred));
  if (filters.percent_complete_lt !== undefined)
    q.set('percent_complete_lt', String(filters.percent_complete_lt));
  if (filters.percent_complete_gte !== undefined)
    q.set('percent_complete_gte', String(filters.percent_complete_gte));
  if (filters.due_before) q.set('due_before', filters.due_before);
  if (filters.include_deleted) q.set('include_deleted', 'true');
  if (filters.limit) q.set('limit', String(filters.limit));
  if (filters.cursor) q.set('cursor', filters.cursor);
  return (await request<{ tasks: TaskWithAssigneesRow[]; next_cursor?: string }>(
    `/api/planner/v1/tasks/mine${q.toString() ? `?${q}` : ''}`,
  )) as { tasks: TaskWithAssigneesRow[]; next_cursor?: string };
}

async function getTask(task_id: string): Promise<TaskDetailRow> {
  return (await request<TaskDetailRow>(`/api/planner/v1/tasks/${task_id}`)) as TaskDetailRow;
}

async function createTask(input: {
  plan_id: string;
  bucket_id?: string;
  title: string;
  description?: string;
  priority_number?: 1 | 3 | 5 | 9;
  start_at?: string;
  due_at?: string;
  preview_type?: TaskRow['preview_type'];
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
    Pick<
      TaskRow,
      | 'title'
      | 'description'
      | 'priority_number'
      | 'percent_complete'
      | 'is_deferred'
      | 'preview_type'
      | 'start_at'
      | 'due_at'
      | 'skill_tags'
      | 'review_state'
    >
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
  bucket_id?: string | null;
  before_id?: string;
  after_id?: string;
  /** Cross-plan move: target plan id. Labels are dropped server-side. */
  new_plan_id?: string;
}): Promise<TaskRow> {
  return (await request<TaskRow>(`/api/planner/v1/tasks/${input.task_id}/move`, {
    method: 'POST',
    body: JSON.stringify({
      expected_version: input.expected_version,
      bucket_id: input.bucket_id,
      before_id: input.before_id,
      after_id: input.after_id,
      new_plan_id: input.new_plan_id,
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

async function addTaskReference(input: {
  task_id: string;
  url: string;
  alias?: string;
  type?: TaskReferenceType;
}): Promise<TaskReferenceRow> {
  return (await request<TaskReferenceRow>(`/api/planner/v1/tasks/${input.task_id}/references`, {
    method: 'POST',
    body: JSON.stringify({ url: input.url, alias: input.alias, type: input.type }),
  })) as TaskReferenceRow;
}

async function removeTaskReference(input: { task_id: string; url: string }): Promise<void> {
  await request<void>(`/api/planner/v1/tasks/${input.task_id}/references`, {
    method: 'DELETE',
    body: JSON.stringify({ url: input.url }),
  });
}

async function setTaskAssignees(input: {
  task_id: string;
  assignees: Array<{ user_id: string; order_hint?: string }>;
}): Promise<void> {
  await request<void>(`/api/planner/v1/tasks/${input.task_id}/assignees`, {
    method: 'PUT',
    body: JSON.stringify({ assignees: input.assignees }),
  });
}

async function setAssigneePriority(input: {
  task_id: string;
  value: string | null;
}): Promise<TaskRow> {
  return (await request<TaskRow>(`/api/planner/v1/tasks/${input.task_id}/assignee-priority`, {
    method: 'PUT',
    body: JSON.stringify({ value: input.value }),
  })) as TaskRow;
}

async function listMyTasks(input: {
  filter?: {
    planId?: string;
    groupId?: string;
    priority?: 1 | 3 | 5 | 9;
    due?: 'overdue' | 'this_week' | 'no_date';
  };
  sort?: 'assignee_priority' | 'due_at';
  search?: string;
}): Promise<MyTasksResult> {
  const q = new URLSearchParams();
  if (input.filter?.planId) q.set('planId', input.filter.planId);
  if (input.filter?.groupId) q.set('groupId', input.filter.groupId);
  if (input.filter?.priority !== undefined) q.set('priority', String(input.filter.priority));
  if (input.filter?.due) q.set('due', input.filter.due);
  if (input.sort) q.set('sort', input.sort);
  if (input.search) q.set('q', input.search);
  return (await request<MyTasksResult>(
    `/api/planner/v1/my-tasks${q.toString() ? `?${q}` : ''}`,
  )) as MyTasksResult;
}

export interface PlanCategoriesResponse {
  descriptions: Record<string, string>;
  labels: LabelRow[];
  task_counts: Record<string, number>;
  counts: { categories: number };
}

async function getPlanCategories(plan_id: string): Promise<PlanCategoriesResponse> {
  return (await request<PlanCategoriesResponse>(
    `/api/planner/v1/plans/${plan_id}/categories`,
  )) as PlanCategoriesResponse;
}

async function setCategoryDescriptions(input: {
  plan_id: string;
  slots: Record<number, { name?: string | null; label_id?: string | null }>;
}): Promise<PlanRow> {
  return (await request<PlanRow>(`/api/planner/v1/plans/${input.plan_id}/categories`, {
    method: 'PUT',
    body: JSON.stringify({ slots: input.slots }),
  })) as PlanRow;
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

async function duplicateTask(input: {
  task_id: string;
  options: {
    include_description?: boolean;
    include_checklist?: boolean;
    include_assignees?: boolean;
    include_labels?: boolean;
    include_references?: boolean;
    include_dates?: boolean;
  };
}): Promise<TaskWithAssigneesRow> {
  return (await request<TaskWithAssigneesRow>(`/api/planner/v1/tasks/${input.task_id}/duplicate`, {
    method: 'POST',
    body: JSON.stringify(input.options),
  })) as TaskWithAssigneesRow;
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
  patch: { label?: string; checked?: boolean; order_hint?: string };
}): Promise<ChecklistItemRow> {
  return (await request<ChecklistItemRow>(`/api/planner/v1/checklist-items/${input.item_id}`, {
    method: 'PATCH',
    body: JSON.stringify({ patch: input.patch }),
  })) as ChecklistItemRow;
}

async function removeChecklistItem(input: { item_id: string }): Promise<void> {
  await request<void>(`/api/planner/v1/checklist-items/${input.item_id}`, { method: 'DELETE' });
}

async function searchM365Groups(q: string): Promise<{ groups: M365GroupSearchResult[] }> {
  return (await request<{ groups: M365GroupSearchResult[] }>(
    `/api/integrations/m365/groups/search?q=${encodeURIComponent(q)}`,
  )) as { groups: M365GroupSearchResult[] };
}

async function linkGroupToM365(input: { groupId: string; externalId: string }): Promise<GroupRow> {
  return (await request<GroupRow>(`/api/integrations/m365/groups/${input.groupId}/link`, {
    method: 'POST',
    body: JSON.stringify({ external_id: input.externalId }),
  })) as GroupRow;
}

async function unlinkGroupFromM365(input: { groupId: string }): Promise<GroupRow> {
  return (await request<GroupRow>(`/api/integrations/m365/groups/${input.groupId}/unlink`, {
    method: 'POST',
  })) as GroupRow;
}

async function refreshPlanSync(input: { planId: string }): Promise<{ ok: true }> {
  return (await request<{ ok: true }>(`/api/planner/v1/plans/${input.planId}/refresh-sync`, {
    method: 'POST',
  })) as { ok: true };
}

type PlanConflictDecision =
  | { kind: 'plan'; field: string; choice: 'local' | 'remote' }
  | { kind: 'task'; task_id: string; field: string; choice: 'local' | 'remote' };

async function resolvePlanConflicts(input: {
  planId: string;
  decisions: PlanConflictDecision[];
}): Promise<{ applied: number }> {
  return (await request<{ applied: number }>(
    `/api/planner/v1/plans/${input.planId}/resolve-conflicts`,
    { method: 'POST', body: JSON.stringify({ decisions: input.decisions }) },
  )) as { applied: number };
}

async function refreshGroupSync(input: { groupId: string }): Promise<{ ok: true }> {
  return (await request<{ ok: true }>(`/api/integrations/m365/groups/${input.groupId}/refresh`, {
    method: 'POST',
  })) as { ok: true };
}

async function resolveGroupConflict(input: {
  groupId: string;
  decisions: Array<{ field: string; choice: 'local' | 'remote' }>;
}): Promise<{ ok: true }> {
  return (await request<{ ok: true }>(`/api/integrations/m365/groups/${input.groupId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ decisions: input.decisions }),
  })) as { ok: true };
}

async function getGroupSyncStatus(input: { groupId: string }): Promise<GroupSyncStatusResponse> {
  return (await request<GroupSyncStatusResponse>(
    `/api/integrations/m365/groups/${input.groupId}/sync-status`,
  )) as GroupSyncStatusResponse;
}

async function listComments(
  task_id: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<CommentListResult> {
  const q = new URLSearchParams();
  if (opts.cursor) q.set('cursor', opts.cursor);
  if (opts.limit !== undefined) q.set('limit', String(opts.limit));
  return (await request<CommentListResult>(
    `/api/planner/v1/tasks/${task_id}/comments${q.toString() ? `?${q}` : ''}`,
  )) as CommentListResult;
}

async function postComment(input: { task_id: string; body: string }): Promise<CommentDto> {
  return (await request<CommentDto>(`/api/planner/v1/tasks/${input.task_id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: input.body }),
  })) as CommentDto;
}

async function updateComment(input: { comment_id: string; body: string }): Promise<CommentDto> {
  return (await request<CommentDto>(`/api/planner/v1/comments/${input.comment_id}`, {
    method: 'PATCH',
    body: JSON.stringify({ body: input.body }),
  })) as CommentDto;
}

async function deleteComment(input: { comment_id: string }): Promise<void> {
  await request<void>(`/api/planner/v1/comments/${input.comment_id}`, { method: 'DELETE' });
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
  listGroupsWithCounts,
  listMyGroups,
  getGroup,
  getGroupActivity,
  createGroup,
  updateGroup,
  deleteGroup,
  restoreGroup,
  listGroupMembers,
  listGroupMemberCandidates,
  addGroupMembersBulk,
  addGroupMember,
  removeGroupMember,
  setMemberRole,
  discoverGroups,
  createJoinRequest,
  listJoinRequests,
  resolveJoinRequest,
  listPlans,
  listGroupPlansWithRollups,
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
  moveBucket,
  deleteBucket,
  listTasks,
  listMyAssignedTasks,
  getTask,
  createTask,
  updateTask,
  moveTask,
  assignTask,
  unassignTask,
  addTaskReference,
  removeTaskReference,
  setTaskAssignees,
  setAssigneePriority,
  listMyTasks,
  getPlanCategories,
  setCategoryDescriptions,
  completeTask,
  reopenTask,
  deleteTask,
  duplicateTask,
  restoreTask,
  applyLabel,
  unapplyLabel,
  listChecklistItems,
  addChecklistItem,
  updateChecklistItem,
  removeChecklistItem,
  listTaskEvents,
  listComments,
  postComment,
  updateComment,
  deleteComment,
  searchM365Groups,
  linkGroupToM365,
  unlinkGroupFromM365,
  refreshGroupSync,
  resolveGroupConflict,
  getGroupSyncStatus,
  refreshPlanSync,
  resolvePlanConflicts,
} as const;
