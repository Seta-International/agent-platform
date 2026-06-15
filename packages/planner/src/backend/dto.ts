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

export interface GroupMemberPreview {
  user_id: string;
  display_name: string;
}

export interface GroupWithCountsRow extends GroupRow {
  plan_count: number;
  member_count: number;
  owner_display_name: string | null;
  owner_email: string | null;
  members_preview: ReadonlyArray<GroupMemberPreview>;
}

export type GroupJoinRequestStatus = 'pending' | 'approved' | 'rejected';

export interface GroupJoinRequestRow {
  group_id: string;
  user_id: string;
  status: GroupJoinRequestStatus;
  requested_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  // Denormalised for the GroupRail view — populated by listJoinRequests
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
  sync_status: 'idle' | 'pulling' | 'pushing' | 'error' | 'conflict';
  last_error: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  archived_at: string | null;
  version: number;
}

export interface GroupActivityItem {
  event_id: string;
  event_type: string;
  /** Human-friendly verb derived from event_type, e.g. "moved task" or "added member". */
  verb: string;
  /** Payload title/name when present, otherwise null. UI may render "<verb> <target_title>". */
  target_title: string | null;
  occurred_at: string;
  actor_user_id: string | null;
  /** Resolved from planner.assignee_projection; null when projection lookup misses. */
  actor_display_name: string | null;
  /** For member/assignment events: the user the action was performed on. */
  target_user_id: string | null;
  /** Resolved display name for target_user_id; null when projection lookup misses. */
  target_user_display_name: string | null;
  /** Snapshot of relevant fields before the change (e.g. role, name). */
  before_state: Record<string, unknown> | null;
  /** Snapshot of relevant fields after the change. */
  after_state: Record<string, unknown> | null;
  /** Which fields changed — used for update events to build precise labels. */
  changed_fields: string[] | null;
}

export interface GroupActivityResult {
  /** Total events in the window (independent of `items.length`, which is capped by `limit`). */
  count: number;
  items: ReadonlyArray<GroupActivityItem>;
  /** Opaque keyset cursor — present only on feed calls when more pages exist. */
  next_cursor?: string;
  /** True when items.length === limit, meaning there may be more pages. */
  has_more: boolean;
}

export interface PlanWithRollupsRow extends PlanRow {
  task_count: number;
  /** Tasks that are not yet 100% complete and not deferred. */
  open_task_count: number;
  /** MS Planner 3-state progress buckets: percent_complete = 0. */
  not_started_count: number;
  /** MS Planner 3-state progress buckets: percent_complete = 50. */
  in_progress_count: number;
  /** MS Planner 3-state progress buckets: percent_complete = 100. */
  completed_count: number;
  /** Average percent_complete across non-deleted tasks, 0..1. Null when plan has no tasks. */
  percent_complete: number | null;
  /** Latest task due_at across non-deleted tasks. Null when no tasks have due dates. */
  latest_due_at: string | null;
  owner_display_name: string | null;
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
  description_text: string | null;
  priority_number: TaskPriorityNumber;
  percent_complete: number;
  is_deferred: boolean;
  preview_type: TaskPreviewType;
  review_state: 'needs_review' | null;
  start_at: string | null;
  due_at: string | null;
  order_hint: string | null;
  assignee_priority: string | null;
  external_source: TaskExternalSource;
  external_id: string | null;
  external_etag: string | null;
  external_synced_at: string | null;
  sync_status: 'idle' | 'pulling' | 'pushing' | 'error' | 'conflict';
  last_error: string | null;
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

export interface ChecklistPreviewItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface ReferencePreviewItem {
  id: string;
  url: string;
  alias: string | null;
  type: TaskReferenceType;
  /** Hostname from `new URL(url).hostname`; '' when the URL fails to parse. */
  host: string;
}

export interface TaskWithAssigneesRow extends TaskRow {
  assignees: AssigneeRow[];
  labels: LabelRow[];
  checklist_summary: { total: number; checked: number };
  /** First 3 checklist items ordered by order_hint NULLS LAST, id. Empty when none. */
  checklist_preview: ChecklistPreviewItem[];
  /** First reference ordered by preview_priority NULLS LAST, id. Empty when none. */
  reference_preview: ReferencePreviewItem[];
}

/** Result of listPlanTasksByDateRange — the plan calendar's data contract. */
export interface CalendarTasksResult {
  tasks: TaskWithAssigneesRow[];
  /** Present when another page exists; opaque keyset cursor. */
  next_cursor?: string;
  /** Count of ALL tasks matching the date-range filter, ignoring pagination. */
  total_count: number;
}

// Single-task detail shape — what /tasks/:id and getTask return. Lists keep the
// lighter TaskWithAssigneesRow (which exposes only a checklist count) so board
// queries don't fan out per-task. Detail screens need the full ordered checklist
// and the reference list.
export interface TaskDetailRow extends TaskWithAssigneesRow {
  checklist: ChecklistItemRow[];
  references: TaskReferenceRow[];
  // Set by the REST handler — null unless a planner.assignBySkill
  // workflow run is suspended for this task in the same tenant.
  pending_assign_workflow_run_id?: string | null;
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
  assignees: AssigneeRow[];
  labels: LabelRow[];
}

export interface MyTasksResult {
  late: TaskWithPlan[];
  dueThisWeek: TaskWithPlan[];
  inProgress: TaskWithPlan[];
  notStarted: TaskWithPlan[];
  recentlyCompleted: TaskWithPlan[];
}

export interface ChartStatus {
  not_started: number;
  in_progress: number;
  completed: number;
}

export interface ChartData {
  kpis: {
    total: number;
    completed: number;
    in_progress: number;
    not_started: number;
    open: number; // not_started + in_progress
    late: number; // overdue & not completed
  };
  byStatus: ChartStatus;
  byPriority: Array<
    { key: 'urgent' | 'important' | 'medium' | 'low'; label: string } & ChartStatus
  >;
  byBucket: Array<{ bucketId: string; name: string } & ChartStatus>;
  byMember: Array<{ userId: string; displayName: string } & ChartStatus>;
  workload: Array<{
    userId: string;
    displayName: string;
    open: number;
    completed: number;
    total: number;
  }>;
}

export interface CommentDto {
  id: string;
  task_id: string;
  author_id: string;
  author_display_name: string;
  body: string;
  created_at: string;
  edited_at: string | null;
}

export interface CommentListResult {
  comments: CommentDto[];
  next_cursor?: string;
  has_more: boolean;
}
