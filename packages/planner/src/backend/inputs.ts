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
    percent_complete: z.union([z.literal(0), z.literal(50), z.literal(100)]).optional(),
    priority_number: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(9)]).optional(),
    is_deferred: z.boolean().optional(),
    preview_type: z
      .enum(['automatic', 'noPreview', 'checklist', 'description', 'reference'])
      .optional(),
    order_hint: z.string().nullable().optional(),
    assignee_priority: z.string().nullable().optional(),
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

export interface LinkPlanToM365Input {
  plan_id: string;
  external_id: string;
}

export interface UnlinkPlanFromM365Input {
  plan_id: string;
}

export interface MarkPlanSyncStatusInput {
  plan_id: string;
  status: 'idle' | 'pulling' | 'pushing' | 'error' | 'conflict';
  error?: string | null;
}

export interface MarkTaskSyncStatusInput {
  task_id: string;
  status: 'idle' | 'pulling' | 'pushing' | 'error' | 'conflict';
  error?: string | null;
}

export interface RefreshPlanSyncInput {
  plan_id: string;
}

export interface ResolvePlanConflictsInput {
  plan_id: string;
  decisions: Array<
    | { kind: 'plan'; field: string; choice: 'local' | 'remote' }
    | { kind: 'task'; task_id: string; field: string; choice: 'local' | 'remote' }
  >;
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
  /**
   * Cross-plan move: target plan id. When provided and different from the
   * task's current plan, the task is relocated to the target plan. The
   * `bucket_id` (if any) must belong to the target plan; otherwise the task
   * is appended to the target plan's tail (no bucket).
   *
   * Per Microsoft Planner parity, plan-scoped associations (labels) are
   * dropped on cross-plan move; assignees, checklist items, references,
   * description, dates, priority, percent_complete, and preview_type are
   * preserved.
   */
  new_plan_id?: string;
}

export interface MoveBucketInput {
  plan_id: string;
  bucket_id: string;
  before_id?: string;
  after_id?: string;
}

/**
 * Field toggles mirroring Microsoft Planner's "Copy task" dialog. When a flag
 * is omitted, the engine default applies (description + checklist on; others
 * off). The new task always lands in the same bucket as the source.
 */
export interface DuplicateTaskOptions {
  include_description?: boolean;
  include_checklist?: boolean;
  include_assignees?: boolean;
  include_labels?: boolean;
  include_references?: boolean;
  include_dates?: boolean;
}

export interface DuplicateTaskInput {
  task_id: string;
  options?: DuplicateTaskOptions;
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
  /** ISO 8601 instant (inclusive lower bound). */
  from: string;
  /** ISO 8601 instant (inclusive upper bound). */
  to: string;
  /** Page size; default 50, clamped to [1, 200]. */
  limit?: number;
  /** Opaque keyset cursor from a previous page's next_cursor. */
  cursor?: string;
}

export type ChartStatusKey = 'not_started' | 'in_progress' | 'completed';

export interface ChartFilters {
  assignee_ids?: string[];
  bucket_ids?: string[];
  priorities?: Array<1 | 3 | 5 | 9>;
  statuses?: ChartStatusKey[];
  /** Filters tasks by due_at within [from, to] (inclusive). */
  range?: { from?: string; to?: string };
}

export interface GetPlanChartDataInput {
  plan_id: string;
  filters?: ChartFilters;
}

export interface CreateCommentInput {
  task_id: string;
  body: string;
}

export interface UpdateCommentInput {
  comment_id: string;
  body: string;
}

export interface DeleteCommentInput {
  comment_id: string;
}

export interface ListCommentsInput {
  task_id: string;
  limit?: number;
  cursor?: string;
}

export interface CreateJoinRequestInput {
  group_id: string;
  session: import('@seta/core').SessionScope;
}

export interface ResolveJoinRequestInput {
  group_id: string;
  user_id: string;
  action: 'approved' | 'rejected';
  session: import('./domain/_actor.ts').PlannerSessionScope;
}

export interface DiscoverGroupsInput {
  q: string;
  session: import('@seta/core').SessionScope;
}
