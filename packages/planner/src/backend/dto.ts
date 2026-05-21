export type GroupTheme = 'teal' | 'purple' | 'green' | 'blue' | 'pink' | 'orange' | 'red';
export type GroupVisibility = 'private' | 'public';
export type GroupDefaultRole = 'owner' | 'member';
export type GroupExternalSource = 'native' | 'm365';
export type GroupMemberRole = 'owner' | 'member';
export type GroupSyncStatus = 'idle' | 'pulling' | 'pushing' | 'error' | 'conflict';

export type TaskExternalSource = 'native' | 'm365';
export type TaskPriorityNumber = 1 | 3 | 5 | 9;
export type TaskPreviewType = 'automatic' | 'noPreview' | 'checklist' | 'description' | 'reference';
export type TaskReferenceType =
  | 'word'
  | 'excel'
  | 'powerPoint'
  | 'visio'
  | 'other'
  | 'powerBI'
  | 'oneNote'
  | 'sharePoint'
  | 'web'
  | 'link';

export interface GroupRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  theme: GroupTheme;
  visibility: GroupVisibility;
  default_role: GroupDefaultRole;
  external_source: GroupExternalSource;
  external_id: string | null;
  external_synced_at: string | null;
  account_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

export interface GroupWithCountsRow extends GroupRow {
  plan_count: number;
  member_count: number;
  owner_display_name: string | null;
  owner_email: string | null;
}

export interface PlanRow {
  id: string;
  tenant_id: string;
  group_id: string;
  name: string;
  category_descriptions: Record<string, string>;
  external_source: TaskExternalSource;
  external_id: string | null;
  external_etag: string | null;
  external_synced_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

export interface BucketRow {
  id: string;
  tenant_id: string;
  plan_id: string;
  name: string;
  order_hint: string | null;
  external_source: TaskExternalSource;
  external_id: string | null;
  external_etag: string | null;
  external_synced_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

export interface TaskRow {
  id: string;
  tenant_id: string;
  plan_id: string;
  bucket_id: string | null;
  title: string;
  description: string | null;
  priority_number: TaskPriorityNumber;
  percent_complete: number;
  is_deferred: boolean;
  preview_type: TaskPreviewType;
  review_state: 'needs_review' | null;
  skill_tags: string[];
  start_at: string | null;
  due_at: string | null;
  order_hint: string | null;
  assignee_priority: string | null;
  external_source: TaskExternalSource;
  external_id: string | null;
  external_etag: string | null;
  external_synced_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

export interface AssigneeRow {
  user_id: string;
  display_name: string;
  email: string;
  availability_status: string;
  ooo_until: string | null;
  deactivated_at: string | null;
}

export interface LabelRow {
  id: string;
  tenant_id: string;
  plan_id: string;
  name: string;
  color: string;
  category_slot: number | null;
  created_at: string;
  deleted_at: string | null;
}

export interface ChecklistItemRow {
  id: string;
  task_id: string;
  label: string;
  checked: boolean;
  order_hint: string | null;
  external_id: string | null;
  external_etag: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupMemberRow {
  group_id: string;
  user_id: string;
  role: GroupMemberRole;
  display_name: string;
  email: string;
  added_at: string;
  added_by: string;
}

export interface TaskWithAssigneesRow extends TaskRow {
  assignees: AssigneeRow[];
  labels: LabelRow[];
  checklist_summary: { total: number; checked: number };
}

// Single-task detail shape — what /tasks/:id and getTask return. Lists keep the
// lighter TaskWithAssigneesRow (which exposes only a checklist count) so board
// queries don't fan out per-task. Detail screens need the full ordered checklist
// and the reference list.
export interface TaskDetailRow extends TaskWithAssigneesRow {
  checklist: ChecklistItemRow[];
  references: TaskReferenceRow[];
}

export interface TaskReferenceRow {
  id: string;
  tenant_id: string;
  task_id: string;
  url: string;
  alias: string | null;
  type: TaskReferenceType;
  preview_priority: string | null;
  external_etag: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskWithPlan extends TaskRow {
  plan: { id: string; name: string; group_id: string };
}

export interface MyTasksResult {
  late: TaskWithPlan[];
  dueThisWeek: TaskWithPlan[];
  inProgress: TaskWithPlan[];
  notStarted: TaskWithPlan[];
  recentlyCompleted: TaskWithPlan[];
}

export interface ChartData {
  kpis: { open: number; completed: number; atRisk: number; velocity: number };
  byStatus: Record<'not_started' | 'in_progress' | 'completed' | 'deferred', number>;
  byPriority: Record<'urgent' | 'important' | 'medium' | 'low', number>;
  byBucket: Array<{ bucketId: string; name: string; count: number }>;
  byMember: Array<{ userId: string; displayName: string; count: number }>;
  burndown?: Array<{ date: string; remaining: number; ideal: number }>;
}
