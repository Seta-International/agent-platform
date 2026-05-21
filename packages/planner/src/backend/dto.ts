export type GroupTheme = 'teal' | 'purple' | 'green' | 'blue' | 'pink' | 'orange' | 'red';
export type GroupVisibility = 'private' | 'public';
export type GroupDefaultRole = 'owner' | 'member';
export type GroupExternalSource = 'native' | 'm365';
export type GroupMemberRole = 'owner' | 'member';
export type GroupSyncStatus = 'idle' | 'pulling' | 'pushing' | 'error' | 'conflict';

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
  sort_order: number;
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
  priority: 'urgent' | 'important' | 'medium' | 'low';
  progress: 'not_started' | 'in_progress' | 'completed' | 'deferred';
  review_state: 'needs_review' | null;
  skill_tags: string[];
  due_at: string | null;
  sort_order: number;
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
  created_at: string;
  deleted_at: string | null;
}

export interface ChecklistItemRow {
  id: string;
  task_id: string;
  label: string;
  checked: boolean;
  sort_order: number;
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
