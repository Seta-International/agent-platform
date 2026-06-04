export type Uuid = string;

export interface PlannerEventActor {
  type: 'user' | 'cli' | 'system' | 'agent' | 'sync';
  user_id: Uuid | null;
  binding_id?: string; // when type === 'sync'
  system_id?: 'integrations.m365';
}

export type TaskMutableFields = {
  title: string;
  description: string | null;
  // Cross-plan move emits a `planner.task.updated` with `plan_id` in the
  // changed_fields list so subscribers can re-parent projections.
  plan_id: Uuid;
  bucket_id: Uuid | null;
  priority_number: 1 | 3 | 5 | 9;
  percent_complete: number;
  is_deferred: boolean;
  preview_type: 'automatic' | 'noPreview' | 'checklist' | 'description' | 'reference';
  start_at: string | null;
  due_at: string | null;
  order_hint: string | null;
  assignee_priority: string | null;
  skill_tags: string[];
  review_state: 'needs_review' | null;
  external_source: 'native' | 'm365';
  external_id: string | null;
  external_etag: string | null;
  external_synced_at: string | null;
};

export type TaskChangedField = keyof TaskMutableFields;

export type PlanSyncStatus = 'idle' | 'pulling' | 'pushing' | 'error' | 'conflict';

export type PlanFieldKey =
  | 'name'
  | 'external_source'
  | 'external_id'
  | 'external_etag'
  | 'external_synced_at';

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export type GroupFieldKey =
  | 'name'
  | 'description'
  | 'theme'
  | 'visibility'
  | 'default_role'
  | 'external_source'
  | 'external_id';

export interface PlannerGroupCreated {
  event_type: 'planner.group.created';
  event_version: 1;
  aggregate_type: 'planner.group';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    after: {
      group_id: Uuid;
      tenant_id: Uuid;
      name: string;
      description: string | null;
      theme: 'teal' | 'purple' | 'green' | 'blue' | 'pink' | 'orange' | 'red';
      visibility: 'private' | 'public';
      default_role: 'owner' | 'member';
      external_source: 'native' | 'm365';
      external_id: string | null;
      account_id: Uuid | null;
      created_by: Uuid;
    };
  };
}

export interface PlannerGroupUpdated {
  event_type: 'planner.group.updated';
  event_version: 1;
  aggregate_type: 'planner.group';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    before: Partial<Record<GroupFieldKey, unknown>>;
    after: Partial<Record<GroupFieldKey, unknown>>;
    changed_fields: GroupFieldKey[];
    version_before: number;
    version_after: number;
  };
}

export interface PlannerGroupDeleted {
  event_type: 'planner.group.deleted';
  event_version: 1;
  aggregate_type: 'planner.group';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    version_before: number;
    deleted_at: string;
  };
}

export interface PlannerGroupRestored {
  event_type: 'planner.group.restored';
  event_version: 1;
  aggregate_type: 'planner.group';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    version_after: number;
  };
}

export interface PlannerGroupMemberAdded {
  event_type: 'planner.group.member.added';
  event_version: 1;
  aggregate_type: 'planner.group';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    user_id: Uuid;
  };
}

export interface PlannerGroupMemberRemoved {
  event_type: 'planner.group.member.removed';
  event_version: 1;
  aggregate_type: 'planner.group';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    user_id: Uuid;
  };
}

export interface PlannerGroupMemberRoleChanged {
  event_type: 'planner.group.member.role-changed';
  event_version: 1;
  aggregate_type: 'planner.group';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    user_id: Uuid;
    before_role: 'owner' | 'member';
    after_role: 'owner' | 'member';
  };
}

export interface PlannerGroupJoinRequested {
  event_type: 'planner.group.join.requested';
  event_version: 1;
  aggregate_type: 'planner.group';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    user_id: Uuid;
    tenant_id: Uuid;
  };
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export interface PlannerPlanCreated {
  event_type: 'planner.plan.created';
  event_version: 1;
  aggregate_type: 'planner.plan';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    after: {
      plan_id: Uuid;
      group_id: Uuid;
      name: string;
      created_by: Uuid;
    };
  };
}

export interface PlannerPlanUpdated {
  event_type: 'planner.plan.updated';
  event_version: 1;
  aggregate_type: 'planner.plan';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    plan_id: Uuid;
    before: Partial<Record<PlanFieldKey, unknown>>;
    after: Partial<Record<PlanFieldKey, unknown>>;
    changed_fields: PlanFieldKey[];
    version_before: number;
    version_after: number;
  };
}

export interface PlannerPlanSyncStatusChanged {
  event_type: 'planner.plan.sync-status-changed';
  event_version: 1;
  aggregate_type: 'planner.plan';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    tenant_id: Uuid;
    group_id: Uuid;
    plan_id: Uuid;
    before_status: PlanSyncStatus;
    after_status: PlanSyncStatus;
    error: string | null;
  };
}

export interface PlannerTaskSyncStatusChanged {
  event_type: 'planner.task.sync-status-changed';
  event_version: 1;
  aggregate_type: 'planner.task';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    tenant_id: Uuid;
    group_id: Uuid;
    plan_id: Uuid;
    task_id: Uuid;
    before_status: PlanSyncStatus;
    after_status: PlanSyncStatus;
    error: string | null;
  };
}

export type PlannerConflictDecision =
  | { kind: 'plan'; field: string; choice: 'local' | 'remote' }
  | { kind: 'task'; task_id: Uuid; field: string; choice: 'local' | 'remote' };

export interface PlannerPlanConflictResolved {
  event_type: 'planner.plan.conflict-resolved';
  event_version: 1;
  aggregate_type: 'planner.plan';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    tenant_id: Uuid;
    group_id: Uuid;
    plan_id: Uuid;
    decisions: PlannerConflictDecision[];
  };
}

export interface PlannerPlanDeleted {
  event_type: 'planner.plan.deleted';
  event_version: 1;
  aggregate_type: 'planner.plan';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    plan_id: Uuid;
    version_before: number;
    deleted_at: string;
  };
}

export interface PlannerPlanRestored {
  event_type: 'planner.plan.restored';
  event_version: 1;
  aggregate_type: 'planner.plan';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    plan_id: Uuid;
    version_after: number;
  };
}

export interface PlannerPlanCategoryDescriptionChanged {
  event_type: 'planner.plan.category-description-changed';
  event_version: 1;
  aggregate_type: 'planner.plan';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    tenant_id: Uuid;
    plan_id: Uuid;
    slot: number;
    before: string | null;
    after: string | null;
  };
}

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------

export interface PlannerBucketCreated {
  event_type: 'planner.bucket.created';
  event_version: 1;
  aggregate_type: 'planner.bucket';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    after: {
      bucket_id: Uuid;
      plan_id: Uuid;
      group_id: Uuid;
      name: string;
      order_hint: string | null;
    };
  };
}

export interface PlannerBucketUpdated {
  event_type: 'planner.bucket.updated';
  event_version: 1;
  aggregate_type: 'planner.bucket';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    bucket_id: Uuid;
    plan_id: Uuid;
    before: Partial<{ name: string; order_hint: string | null }>;
    after: Partial<{ name: string; order_hint: string | null }>;
    version_before: number;
    version_after: number;
  };
}

export interface PlannerBucketDeleted {
  event_type: 'planner.bucket.deleted';
  event_version: 1;
  aggregate_type: 'planner.bucket';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    bucket_id: Uuid;
    plan_id: Uuid;
    version_before: number;
    deleted_task_ids: string[];
  };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface PlannerTaskCreated {
  event_type: 'planner.task.created';
  event_version: 1;
  aggregate_type: 'planner.task';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    after: {
      task_id: Uuid;
      plan_id: Uuid;
      group_id: Uuid;
      bucket_id: Uuid | null;
      title: string;
      description: string | null;
      priority_number: 1 | 3 | 5 | 9;
      percent_complete: number;
      is_deferred: boolean;
      preview_type: 'automatic' | 'noPreview' | 'checklist' | 'description' | 'reference';
      start_at: string | null;
      due_at: string | null;
      order_hint: string | null;
      assignee_priority: string | null;
      skill_tags: string[];
      review_state: 'needs_review' | null;
      external_source: 'native' | 'm365';
      external_id: string | null;
      created_by: Uuid;
    };
  };
}

export interface PlannerTaskUpdated {
  event_type: 'planner.task.updated';
  event_version: 1;
  aggregate_type: 'planner.task';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    task_id: Uuid;
    plan_id: Uuid;
    before: Partial<TaskMutableFields>;
    after: Partial<TaskMutableFields>;
    changed_fields: TaskChangedField[];
    version_before: number;
    version_after: number;
  };
}

export interface PlannerTaskDeleted {
  event_type: 'planner.task.deleted';
  event_version: 1;
  aggregate_type: 'planner.task';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    task_id: Uuid;
    plan_id: Uuid;
    version_before: number;
    deleted_at: string;
  };
}

export interface PlannerTaskRestored {
  event_type: 'planner.task.restored';
  event_version: 1;
  aggregate_type: 'planner.task';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    task_id: Uuid;
    plan_id: Uuid;
    version_after: number;
  };
}

export interface PlannerTaskMoved {
  event_type: 'planner.task.moved';
  event_version: 1;
  aggregate_type: 'planner.task';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    task_id: Uuid;
    /**
     * The task's plan at the time of emission. For cross-plan moves this is
     * the new (target) plan; use `from_plan_id` / `to_plan_id` to recover
     * the source. For in-plan moves `plan_id` equals both.
     */
    plan_id: Uuid;
    /** Cross-plan move source — equals `plan_id` for in-plan moves. */
    from_plan_id: Uuid;
    /** Cross-plan move target — equals `plan_id` for in-plan moves. */
    to_plan_id: Uuid;
    before: { bucket_id: Uuid | null; order_hint: string | null };
    after: { bucket_id: Uuid | null; order_hint: string | null };
    version_before: number;
    version_after: number;
  };
}

export interface PlannerTaskAssigned {
  event_type: 'planner.task.assigned';
  event_version: 1;
  aggregate_type: 'planner.task';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    task_id: Uuid;
    plan_id: Uuid;
    user_id: Uuid;
  };
}

export interface PlannerTaskUnassigned {
  event_type: 'planner.task.unassigned';
  event_version: 1;
  aggregate_type: 'planner.task';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    task_id: Uuid;
    plan_id: Uuid;
    user_id: Uuid;
  };
}

export interface PlannerTaskCompleted {
  event_type: 'planner.task.completed';
  event_version: 1;
  aggregate_type: 'planner.task';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    task_id: Uuid;
    plan_id: Uuid;
    version_before: number;
    version_after: number;
    completed_at: string;
  };
}

export interface PlannerTaskReopened {
  event_type: 'planner.task.reopened';
  event_version: 1;
  aggregate_type: 'planner.task';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    task_id: Uuid;
    plan_id: Uuid;
    version_before: number;
    version_after: number;
  };
}

export interface PlannerTaskReferenceAdded {
  event_type: 'planner.task.reference-added';
  event_version: 1;
  aggregate_type: 'planner.task';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    tenant_id: Uuid;
    task_id: Uuid;
    plan_id: Uuid;
    url: string;
    alias: string | null;
    type:
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
  };
}

export interface PlannerTaskReferenceRemoved {
  event_type: 'planner.task.reference-removed';
  event_version: 1;
  aggregate_type: 'planner.task';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    tenant_id: Uuid;
    task_id: Uuid;
    plan_id: Uuid;
    url: string;
  };
}

// ---------------------------------------------------------------------------
// Checklist items
// ---------------------------------------------------------------------------

export interface PlannerChecklistItemAdded {
  event_type: 'planner.checklist_item.added';
  event_version: 1;
  aggregate_type: 'planner.checklist_item';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    item_id: Uuid;
    task_id: Uuid;
    plan_id: Uuid;
    label: string;
    order_hint: string | null;
  };
}

export interface PlannerChecklistItemUpdated {
  event_type: 'planner.checklist_item.updated';
  event_version: 1;
  aggregate_type: 'planner.checklist_item';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    item_id: Uuid;
    task_id: Uuid;
    plan_id: Uuid;
    before: Partial<{ label: string; checked: boolean; order_hint: string | null }>;
    after: Partial<{ label: string; checked: boolean; order_hint: string | null }>;
  };
}

export interface PlannerChecklistItemRemoved {
  event_type: 'planner.checklist_item.removed';
  event_version: 1;
  aggregate_type: 'planner.checklist_item';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    item_id: Uuid;
    task_id: Uuid;
    plan_id: Uuid;
  };
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export interface PlannerLabelCreated {
  event_type: 'planner.label.created';
  event_version: 1;
  aggregate_type: 'planner.label';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    after: {
      label_id: Uuid;
      plan_id: Uuid;
      group_id: Uuid;
      name: string;
      color: string;
    };
  };
}

export interface PlannerLabelUpdated {
  event_type: 'planner.label.updated';
  event_version: 1;
  aggregate_type: 'planner.label';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    label_id: Uuid;
    plan_id: Uuid;
    before: Partial<{ name: string; color: string }>;
    after: Partial<{ name: string; color: string }>;
  };
}

export interface PlannerLabelDeleted {
  event_type: 'planner.label.deleted';
  event_version: 1;
  aggregate_type: 'planner.label';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    label_id: Uuid;
    plan_id: Uuid;
  };
}

export interface PlannerLabelApplied {
  event_type: 'planner.label.applied';
  event_version: 1;
  aggregate_type: 'planner.label';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    task_id: Uuid;
    plan_id: Uuid;
    label_id: Uuid;
  };
}

export interface PlannerLabelUnapplied {
  event_type: 'planner.label.unapplied';
  event_version: 1;
  aggregate_type: 'planner.label';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    group_id: Uuid;
    task_id: Uuid;
    plan_id: Uuid;
    label_id: Uuid;
  };
}

export interface PlannerLabelCategorySlotChanged {
  event_type: 'planner.label.category-slot-changed';
  event_version: 1;
  aggregate_type: 'planner.label';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    tenant_id: Uuid;
    plan_id: Uuid;
    label_id: Uuid;
    before: number | null;
    after: number | null;
  };
}

// ---------------------------------------------------------------------------
// Task comments
// ---------------------------------------------------------------------------

export interface PlannerCommentCreated {
  event_type: 'planner.comment.created';
  event_version: 1;
  aggregate_type: 'planner.comment';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    comment_id: Uuid;
    task_id: Uuid;
    plan_id: Uuid;
    group_id: Uuid;
    author_id: Uuid;
    body: string;
    created_at: string;
  };
}

export interface PlannerCommentUpdated {
  event_type: 'planner.comment.updated';
  event_version: 1;
  aggregate_type: 'planner.comment';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    comment_id: Uuid;
    task_id: Uuid;
    plan_id: Uuid;
    group_id: Uuid;
    before: { body: string };
    after: { body: string; edited_at: string };
  };
}

export interface PlannerCommentDeleted {
  event_type: 'planner.comment.deleted';
  event_version: 1;
  aggregate_type: 'planner.comment';
  aggregate_id: Uuid;
  payload: {
    actor: PlannerEventActor;
    comment_id: Uuid;
    task_id: Uuid;
    plan_id: Uuid;
    group_id: Uuid;
    author_id: Uuid;
  };
}

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export type PlannerEvent =
  | PlannerGroupCreated
  | PlannerGroupUpdated
  | PlannerGroupDeleted
  | PlannerGroupRestored
  | PlannerGroupMemberAdded
  | PlannerGroupMemberRemoved
  | PlannerGroupMemberRoleChanged
  | PlannerGroupJoinRequested
  | PlannerPlanCreated
  | PlannerPlanUpdated
  | PlannerPlanDeleted
  | PlannerPlanRestored
  | PlannerPlanCategoryDescriptionChanged
  | PlannerBucketCreated
  | PlannerBucketUpdated
  | PlannerBucketDeleted
  | PlannerTaskCreated
  | PlannerTaskUpdated
  | PlannerTaskDeleted
  | PlannerTaskRestored
  | PlannerTaskMoved
  | PlannerTaskAssigned
  | PlannerTaskUnassigned
  | PlannerTaskCompleted
  | PlannerTaskReopened
  | PlannerTaskReferenceAdded
  | PlannerTaskReferenceRemoved
  | PlannerChecklistItemAdded
  | PlannerChecklistItemUpdated
  | PlannerChecklistItemRemoved
  | PlannerLabelCreated
  | PlannerLabelUpdated
  | PlannerLabelDeleted
  | PlannerLabelApplied
  | PlannerLabelUnapplied
  | PlannerLabelCategorySlotChanged
  | PlannerPlanSyncStatusChanged
  | PlannerTaskSyncStatusChanged
  | PlannerPlanConflictResolved
  | PlannerCommentCreated
  | PlannerCommentUpdated
  | PlannerCommentDeleted;
