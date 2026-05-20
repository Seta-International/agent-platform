import { emit } from '@seta/core/events';
import type {
  PlannerBucketCreated,
  PlannerBucketDeleted,
  PlannerBucketUpdated,
  PlannerChecklistItemAdded,
  PlannerChecklistItemRemoved,
  PlannerChecklistItemUpdated,
  PlannerEventActor,
  PlannerGroupCreated,
  PlannerGroupDeleted,
  PlannerGroupMemberAdded,
  PlannerGroupMemberRemoved,
  PlannerGroupRestored,
  PlannerGroupUpdated,
  PlannerLabelApplied,
  PlannerLabelCreated,
  PlannerLabelDeleted,
  PlannerLabelUnapplied,
  PlannerLabelUpdated,
  PlannerPlanCreated,
  PlannerPlanDeleted,
  PlannerPlanRestored,
  PlannerPlanUpdated,
  PlannerTaskAssigned,
  PlannerTaskCompleted,
  PlannerTaskCreated,
  PlannerTaskDeleted,
  PlannerTaskMoved,
  PlannerTaskReopened,
  PlannerTaskRestored,
  PlannerTaskUnassigned,
  PlannerTaskUpdated,
  Uuid,
} from './types.ts';

// -----
// Groups
// -----

export async function emitPlannerGroupCreated(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  after: PlannerGroupCreated['payload']['after'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.group',
    aggregateId: args.after.group_id,
    eventType: 'planner.group.created',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.after.group_id,
      after: args.after,
    },
  });
}

export async function emitPlannerGroupUpdated(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  before: PlannerGroupUpdated['payload']['before'];
  after: PlannerGroupUpdated['payload']['after'];
  version_before: number;
  version_after: number;
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.group',
    aggregateId: args.group_id,
    eventType: 'planner.group.updated',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      before: args.before,
      after: args.after,
      version_before: args.version_before,
      version_after: args.version_after,
    },
  });
}

export async function emitPlannerGroupDeleted(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  version_before: PlannerGroupDeleted['payload']['version_before'];
  deleted_at: PlannerGroupDeleted['payload']['deleted_at'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.group',
    aggregateId: args.group_id,
    eventType: 'planner.group.deleted',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      version_before: args.version_before,
      deleted_at: args.deleted_at,
    },
  });
}

export async function emitPlannerGroupRestored(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  version_after: PlannerGroupRestored['payload']['version_after'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.group',
    aggregateId: args.group_id,
    eventType: 'planner.group.restored',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      version_after: args.version_after,
    },
  });
}

export async function emitPlannerGroupMemberAdded(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  user_id: PlannerGroupMemberAdded['payload']['user_id'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.group',
    aggregateId: args.group_id,
    eventType: 'planner.group.member.added',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      user_id: args.user_id,
    },
  });
}

export async function emitPlannerGroupMemberRemoved(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  user_id: PlannerGroupMemberRemoved['payload']['user_id'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.group',
    aggregateId: args.group_id,
    eventType: 'planner.group.member.removed',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      user_id: args.user_id,
    },
  });
}

// -----
// Plans
// -----

export async function emitPlannerPlanCreated(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  after: PlannerPlanCreated['payload']['after'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.plan',
    aggregateId: args.after.plan_id,
    eventType: 'planner.plan.created',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.after.group_id,
      after: args.after,
    },
  });
}

export async function emitPlannerPlanUpdated(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  plan_id: Uuid;
  before: PlannerPlanUpdated['payload']['before'];
  after: PlannerPlanUpdated['payload']['after'];
  version_before: number;
  version_after: number;
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.plan',
    aggregateId: args.plan_id,
    eventType: 'planner.plan.updated',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      plan_id: args.plan_id,
      before: args.before,
      after: args.after,
      version_before: args.version_before,
      version_after: args.version_after,
    },
  });
}

export async function emitPlannerPlanDeleted(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  plan_id: Uuid;
  version_before: PlannerPlanDeleted['payload']['version_before'];
  deleted_at: PlannerPlanDeleted['payload']['deleted_at'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.plan',
    aggregateId: args.plan_id,
    eventType: 'planner.plan.deleted',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      plan_id: args.plan_id,
      version_before: args.version_before,
      deleted_at: args.deleted_at,
    },
  });
}

export async function emitPlannerPlanRestored(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  plan_id: Uuid;
  version_after: PlannerPlanRestored['payload']['version_after'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.plan',
    aggregateId: args.plan_id,
    eventType: 'planner.plan.restored',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      plan_id: args.plan_id,
      version_after: args.version_after,
    },
  });
}

// -----
// Buckets
// -----

export async function emitPlannerBucketCreated(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  after: PlannerBucketCreated['payload']['after'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.bucket',
    aggregateId: args.after.bucket_id,
    eventType: 'planner.bucket.created',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.after.group_id,
      after: args.after,
    },
  });
}

export async function emitPlannerBucketUpdated(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  bucket_id: Uuid;
  plan_id: Uuid;
  before: PlannerBucketUpdated['payload']['before'];
  after: PlannerBucketUpdated['payload']['after'];
  version_before: number;
  version_after: number;
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.bucket',
    aggregateId: args.bucket_id,
    eventType: 'planner.bucket.updated',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      bucket_id: args.bucket_id,
      plan_id: args.plan_id,
      before: args.before,
      after: args.after,
      version_before: args.version_before,
      version_after: args.version_after,
    },
  });
}

export async function emitPlannerBucketDeleted(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  bucket_id: Uuid;
  plan_id: Uuid;
  version_before: number;
  reflowed_task_ids: PlannerBucketDeleted['payload']['reflowed_task_ids'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.bucket',
    aggregateId: args.bucket_id,
    eventType: 'planner.bucket.deleted',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      bucket_id: args.bucket_id,
      plan_id: args.plan_id,
      version_before: args.version_before,
      reflowed_task_ids: args.reflowed_task_ids,
    },
  });
}

// -----
// Tasks
// -----

export async function emitPlannerTaskCreated(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  after: PlannerTaskCreated['payload']['after'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.task',
    aggregateId: args.after.task_id,
    eventType: 'planner.task.created',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.after.group_id,
      after: args.after,
    },
  });
}

export async function emitPlannerTaskUpdated(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  task_id: Uuid;
  plan_id: Uuid;
  before: PlannerTaskUpdated['payload']['before'];
  after: PlannerTaskUpdated['payload']['after'];
  version_before: number;
  version_after: number;
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.task',
    aggregateId: args.task_id,
    eventType: 'planner.task.updated',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      task_id: args.task_id,
      plan_id: args.plan_id,
      before: args.before,
      after: args.after,
      version_before: args.version_before,
      version_after: args.version_after,
    },
  });
}

export async function emitPlannerTaskDeleted(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  task_id: Uuid;
  plan_id: Uuid;
  version_before: PlannerTaskDeleted['payload']['version_before'];
  deleted_at: PlannerTaskDeleted['payload']['deleted_at'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.task',
    aggregateId: args.task_id,
    eventType: 'planner.task.deleted',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      task_id: args.task_id,
      plan_id: args.plan_id,
      version_before: args.version_before,
      deleted_at: args.deleted_at,
    },
  });
}

export async function emitPlannerTaskRestored(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  task_id: Uuid;
  plan_id: Uuid;
  version_after: PlannerTaskRestored['payload']['version_after'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.task',
    aggregateId: args.task_id,
    eventType: 'planner.task.restored',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      task_id: args.task_id,
      plan_id: args.plan_id,
      version_after: args.version_after,
    },
  });
}

export async function emitPlannerTaskMoved(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  task_id: Uuid;
  plan_id: Uuid;
  before: PlannerTaskMoved['payload']['before'];
  after: PlannerTaskMoved['payload']['after'];
  version_before: number;
  version_after: number;
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.task',
    aggregateId: args.task_id,
    eventType: 'planner.task.moved',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      task_id: args.task_id,
      plan_id: args.plan_id,
      before: args.before,
      after: args.after,
      version_before: args.version_before,
      version_after: args.version_after,
    },
  });
}

export async function emitPlannerTaskAssigned(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  task_id: Uuid;
  plan_id: Uuid;
  user_id: PlannerTaskAssigned['payload']['user_id'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.task',
    aggregateId: args.task_id,
    eventType: 'planner.task.assigned',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      task_id: args.task_id,
      plan_id: args.plan_id,
      user_id: args.user_id,
    },
  });
}

export async function emitPlannerTaskUnassigned(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  task_id: Uuid;
  plan_id: Uuid;
  user_id: PlannerTaskUnassigned['payload']['user_id'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.task',
    aggregateId: args.task_id,
    eventType: 'planner.task.unassigned',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      task_id: args.task_id,
      plan_id: args.plan_id,
      user_id: args.user_id,
    },
  });
}

export async function emitPlannerTaskCompleted(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  task_id: Uuid;
  plan_id: Uuid;
  version_before: number;
  version_after: number;
  completed_at: PlannerTaskCompleted['payload']['completed_at'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.task',
    aggregateId: args.task_id,
    eventType: 'planner.task.completed',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      task_id: args.task_id,
      plan_id: args.plan_id,
      version_before: args.version_before,
      version_after: args.version_after,
      completed_at: args.completed_at,
    },
  });
}

export async function emitPlannerTaskReopened(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  task_id: Uuid;
  plan_id: Uuid;
  version_before: PlannerTaskReopened['payload']['version_before'];
  version_after: PlannerTaskReopened['payload']['version_after'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.task',
    aggregateId: args.task_id,
    eventType: 'planner.task.reopened',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      task_id: args.task_id,
      plan_id: args.plan_id,
      version_before: args.version_before,
      version_after: args.version_after,
    },
  });
}

// -----
// Checklist items
// -----

export async function emitPlannerChecklistItemAdded(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  item_id: PlannerChecklistItemAdded['payload']['item_id'];
  task_id: Uuid;
  plan_id: Uuid;
  label: PlannerChecklistItemAdded['payload']['label'];
  sort_order: PlannerChecklistItemAdded['payload']['sort_order'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.checklist_item',
    aggregateId: args.item_id,
    eventType: 'planner.checklist_item.added',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      item_id: args.item_id,
      task_id: args.task_id,
      plan_id: args.plan_id,
      label: args.label,
      sort_order: args.sort_order,
    },
  });
}

export async function emitPlannerChecklistItemUpdated(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  item_id: Uuid;
  task_id: Uuid;
  plan_id: Uuid;
  before: PlannerChecklistItemUpdated['payload']['before'];
  after: PlannerChecklistItemUpdated['payload']['after'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.checklist_item',
    aggregateId: args.item_id,
    eventType: 'planner.checklist_item.updated',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      item_id: args.item_id,
      task_id: args.task_id,
      plan_id: args.plan_id,
      before: args.before,
      after: args.after,
    },
  });
}

export async function emitPlannerChecklistItemRemoved(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: PlannerChecklistItemRemoved['payload']['group_id'];
  item_id: PlannerChecklistItemRemoved['payload']['item_id'];
  task_id: PlannerChecklistItemRemoved['payload']['task_id'];
  plan_id: PlannerChecklistItemRemoved['payload']['plan_id'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.checklist_item',
    aggregateId: args.item_id,
    eventType: 'planner.checklist_item.removed',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      item_id: args.item_id,
      task_id: args.task_id,
      plan_id: args.plan_id,
    },
  });
}

// -----
// Labels
// -----

export async function emitPlannerLabelCreated(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  after: PlannerLabelCreated['payload']['after'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.label',
    aggregateId: args.after.label_id,
    eventType: 'planner.label.created',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.after.group_id,
      after: args.after,
    },
  });
}

export async function emitPlannerLabelUpdated(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  label_id: Uuid;
  plan_id: Uuid;
  before: PlannerLabelUpdated['payload']['before'];
  after: PlannerLabelUpdated['payload']['after'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.label',
    aggregateId: args.label_id,
    eventType: 'planner.label.updated',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      label_id: args.label_id,
      plan_id: args.plan_id,
      before: args.before,
      after: args.after,
    },
  });
}

export async function emitPlannerLabelDeleted(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: PlannerLabelDeleted['payload']['group_id'];
  label_id: PlannerLabelDeleted['payload']['label_id'];
  plan_id: PlannerLabelDeleted['payload']['plan_id'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.label',
    aggregateId: args.label_id,
    eventType: 'planner.label.deleted',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      label_id: args.label_id,
      plan_id: args.plan_id,
    },
  });
}

export async function emitPlannerLabelApplied(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  task_id: PlannerLabelApplied['payload']['task_id'];
  plan_id: Uuid;
  label_id: Uuid;
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.label',
    aggregateId: args.label_id,
    eventType: 'planner.label.applied',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      task_id: args.task_id,
      plan_id: args.plan_id,
      label_id: args.label_id,
    },
  });
}

export async function emitPlannerLabelUnapplied(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  task_id: PlannerLabelUnapplied['payload']['task_id'];
  plan_id: Uuid;
  label_id: Uuid;
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.label',
    aggregateId: args.label_id,
    eventType: 'planner.label.unapplied',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      task_id: args.task_id,
      plan_id: args.plan_id,
      label_id: args.label_id,
    },
  });
}
