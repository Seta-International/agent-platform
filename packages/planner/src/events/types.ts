export type Uuid = string;

export interface PlannerEventActor {
  type: 'user' | 'cli' | 'system' | 'agent' | 'sync';
  user_id: Uuid | null;
  binding_id?: string; // when type === 'sync'
}

export type TaskMutableFields = {
  title: string;
  description: string | null;
  priority: 'urgent' | 'important' | 'medium' | 'low';
  due_at: string | null;
  skill_tags: string[];
  review_state: 'needs_review' | null;
  progress: 'not_started' | 'in_progress' | 'completed' | 'deferred';
};

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

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
    before: Partial<{ name: string }>;
    after: Partial<{ name: string }>;
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
    before: Partial<{ name: string }>;
    after: Partial<{ name: string }>;
    version_before: number;
    version_after: number;
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
      sort_order: number;
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
    before: Partial<{ name: string; sort_order: number }>;
    after: Partial<{ name: string; sort_order: number }>;
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
    reflowed_task_ids: string[];
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
      priority: 'urgent' | 'important' | 'medium' | 'low';
      due_at: string | null;
      skill_tags: string[];
      review_state: 'needs_review' | null;
      sort_order: number;
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
    plan_id: Uuid;
    before: { bucket_id: Uuid | null; sort_order: number };
    after: { bucket_id: Uuid | null; sort_order: number };
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
    sort_order: number;
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
    before: Partial<{ label: string; checked: boolean; sort_order: number }>;
    after: Partial<{ label: string; checked: boolean; sort_order: number }>;
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
  | PlannerPlanCreated
  | PlannerPlanUpdated
  | PlannerPlanDeleted
  | PlannerPlanRestored
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
  | PlannerChecklistItemAdded
  | PlannerChecklistItemUpdated
  | PlannerChecklistItemRemoved
  | PlannerLabelCreated
  | PlannerLabelUpdated
  | PlannerLabelDeleted
  | PlannerLabelApplied
  | PlannerLabelUnapplied;
