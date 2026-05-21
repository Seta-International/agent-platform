import { z } from 'zod';
import type {
  GroupDefaultRole,
  GroupMemberRole,
  GroupTheme,
  GroupVisibility,
  TaskPreviewType,
  TaskPriorityNumber,
  TaskReferenceType,
} from './dto.ts';

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
  priority_number?: TaskPriorityNumber;
  percent_complete?: number;
  is_deferred?: boolean;
  preview_type?: TaskPreviewType;
  start_at?: string;
  due_at?: string;
  skill_tags?: string[];
  review_state?: 'needs_review';
}

export interface UpdateTaskPatch {
  title?: string;
  description?: string | null;
  bucket_id?: string | null;
  start_at?: string | null;
  due_at?: string | null;
  percent_complete?: number;
  priority_number?: TaskPriorityNumber;
  is_deferred?: boolean;
  preview_type?: TaskPreviewType;
  order_hint?: string | null;
  assignee_priority?: string | null;
  skill_tags?: string[];
  review_state?: 'needs_review' | null;
  // Spec 2 hook — accepted only when isM365SystemActor(session)
  external_source?: 'native' | 'm365';
  external_id?: string | null;
  external_etag?: string | null;
  external_synced_at?: string | null;
}

// Runtime guard. Strict so unknown keys (including the removed legacy
// `priority` / `progress`) raise instead of silently passing through.
export const UpdateTaskPatchSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    bucket_id: z.string().uuid().nullable().optional(),
    start_at: z.string().datetime({ offset: true }).nullable().optional(),
    due_at: z.string().datetime({ offset: true }).nullable().optional(),
    percent_complete: z.number().int().min(0).max(100).optional(),
    priority_number: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(9)]).optional(),
    is_deferred: z.boolean().optional(),
    preview_type: z
      .enum(['automatic', 'noPreview', 'checklist', 'description', 'reference'])
      .optional(),
    order_hint: z.string().nullable().optional(),
    assignee_priority: z.string().nullable().optional(),
    skill_tags: z.array(z.string()).optional(),
    review_state: z.enum(['needs_review']).nullable().optional(),
    external_source: z.enum(['native', 'm365']).optional(),
    external_id: z.string().nullable().optional(),
    external_etag: z.string().nullable().optional(),
    external_synced_at: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export interface AddChecklistItemInput {
  task_id: string;
  label: string;
  after_item_id?: string;
}
export interface UpdateChecklistItemPatch {
  label?: string;
  checked?: boolean;
  order_hint?: string;
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

// ---------------------------------------------------------------------------
// Native-parity ops (PR1)
// ---------------------------------------------------------------------------

export interface MoveTaskInput {
  task_id: string;
  expected_version: number;
  bucket_id?: string | null;
  before_id?: string;
  after_id?: string;
}

export interface MoveBucketInput {
  plan_id: string;
  bucket_id: string;
  before_id?: string;
  after_id?: string;
}

export interface AddTaskReferenceInput {
  task_id: string;
  url: string;
  alias?: string;
  type?: TaskReferenceType;
}

export interface RemoveTaskReferenceInput {
  task_id: string;
  url: string;
}

export interface SetTaskAssigneesInput {
  task_id: string;
  assignees: { user_id: string; order_hint?: string }[];
}

export interface SetAssigneePriorityInput {
  task_id: string;
  value: string | null;
}

export interface SetCategoryDescriptionInput {
  plan_id: string;
  slot: number;
  // undefined = leave unchanged; null = clear; string = set
  name?: string | null;
}

export interface SetCategoryDescriptionsInput {
  plan_id: string;
  // For each slot: name absent = leave unchanged, null = clear, string = set.
  // label_id absent = leave unchanged, null = detach, uuid = attach.
  slots: Record<number, { name?: string | null; label_id?: string | null }>;
}

export interface AttachLabelToCategorySlotInput {
  plan_id: string;
  label_id: string;
  slot: number | null;
}

export interface ListMyTasksInput {
  filter?: {
    plan_id?: string;
    group_id?: string;
    priority?: 'urgent' | 'important' | 'medium' | 'low';
    due?: 'this_week' | 'overdue' | 'no_date';
  };
  sort?: 'assignee_priority' | 'due_at';
}

export interface ListPlanTasksByDateRangeInput {
  plan_id: string;
  from: string;
  to: string;
}

export interface GetPlanChartDataInput {
  plan_id: string;
  range?: { from?: string; to?: string };
}
