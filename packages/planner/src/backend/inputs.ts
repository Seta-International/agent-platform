import type { GroupDefaultRole, GroupMemberRole, GroupTheme, GroupVisibility } from './dto.ts';

export interface CreateGroupInput {
  tenant_id: string;
  name: string;
  description?: string;
  theme?: GroupTheme;
  visibility?: GroupVisibility;
  default_role?: GroupDefaultRole;
  initial_members?: { user_id: string; role: GroupMemberRole }[];
}
export interface UpdateGroupPatch {
  name?: string;
  description?: string | null;
  theme?: GroupTheme;
  visibility?: GroupVisibility;
  default_role?: GroupDefaultRole;
}

export interface CreatePlanInput {
  group_id: string;
  name: string;
}
export interface UpdatePlanPatch {
  name?: string;
}

export interface CreateBucketInput {
  plan_id: string;
  name: string;
  after_bucket_id?: string;
}
export interface UpdateBucketPatch {
  name?: string;
}

export interface CreateTaskInput {
  plan_id: string;
  bucket_id?: string;
  title: string;
  description?: string;
  priority?: 'urgent' | 'important' | 'medium' | 'low';
  progress?: 'not_started' | 'in_progress' | 'completed' | 'deferred';
  due_at?: string;
  skill_tags?: string[];
  review_state?: 'needs_review';
}
export interface UpdateTaskPatch {
  title?: string;
  description?: string | null;
  priority?: 'urgent' | 'important' | 'medium' | 'low';
  due_at?: string | null;
  skill_tags?: string[];
  review_state?: 'needs_review' | null;
}

export interface AddChecklistItemInput {
  task_id: string;
  label: string;
  after_item_id?: string;
}
export interface UpdateChecklistItemPatch {
  label?: string;
  checked?: boolean;
}

export interface CreateLabelInput {
  plan_id: string;
  name: string;
  color: string;
}
export interface UpdateLabelPatch {
  name?: string;
  color?: string;
}

export interface SetMemberRoleInput {
  group_id: string;
  user_id: string;
  role: GroupMemberRole;
}

export interface LinkGroupToM365Input {
  group_id: string;
  external_id: string;
}

export interface MarkGroupSyncStatusInput {
  group_id: string;
  external_synced_at: string;
}
