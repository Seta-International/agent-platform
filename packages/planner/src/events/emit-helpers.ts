import { emit as coreEmit, emitContext } from '@seta/core/events';
import type { DomainEventInput } from '@seta/shared-types';
import {
  extractGroupIdFromPayload,
  touchGroupActivity,
} from '../backend/domain/_touch-group-activity.ts';
import type {
  PlannerBucketCreated,
  PlannerBucketDeleted,
  PlannerBucketUpdated,
  PlannerChecklistItemAdded,
  PlannerChecklistItemRemoved,
  PlannerChecklistItemUpdated,
  PlannerCommentCreated,
  PlannerCommentDeleted,
  PlannerCommentUpdated,
  PlannerEventActor,
  PlannerGroupCreated,
  PlannerGroupDeleted,
  PlannerGroupMemberAdded,
  PlannerGroupMemberRemoved,
  PlannerGroupPurged,
  PlannerGroupRestored,
  PlannerGroupUpdated,
  PlannerLabelApplied,
  PlannerLabelCategorySlotChanged,
  PlannerLabelCreated,
  PlannerLabelDeleted,
  PlannerLabelUnapplied,
  PlannerLabelUpdated,
  PlannerPlanArchived,
  PlannerPlanCategoryDescriptionChanged,
  PlannerPlanConflictResolved,
  PlannerPlanCreated,
  PlannerPlanDeleted,
  PlannerPlanPurged,
  PlannerPlanRestored,
  PlannerPlanSyncStatusChanged,
  PlannerPlanUnarchived,
  PlannerPlanUpdated,
  PlannerTaskAssigned,
  PlannerTaskCompleted,
  PlannerTaskCreated,
  PlannerTaskDeleted,
  PlannerTaskLinkAdded,
  PlannerTaskLinkRemoved,
  PlannerTaskMoved,
  PlannerTaskPurged,
  PlannerTaskReferenceAdded,
  PlannerTaskReferenceRemoved,
  PlannerTaskReopened,
  PlannerTaskRestored,
  PlannerTaskSyncStatusChanged,
  PlannerTaskUnassigned,
  PlannerTaskUpdated,
  TaskChangedField,
  Uuid,
} from './types.ts';

async function touchGroupActivityFromEvent<P>(event: DomainEventInput<P>): Promise<void> {
  const ctx = emitContext.getStore();
  if (!ctx?.tx) return;
  const payload = event.payload as Record<string, unknown>;
  const groupId = extractGroupIdFromPayload(payload);
  if (groupId) {
    await touchGroupActivity(ctx.tx, { group_id: groupId });
  }
  const fromGroupId = payload.from_group_id;
  if (typeof fromGroupId === 'string' && fromGroupId !== groupId) {
    await touchGroupActivity(ctx.tx, { group_id: fromGroupId });
  }
}

async function emit<P>(event: DomainEventInput<P>): Promise<{ eventId: string }> {
  const result = await coreEmit(event);
  await touchGroupActivityFromEvent(event);
  return result;
}

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
  changed_fields: PlannerGroupUpdated['payload']['changed_fields'];
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
      changed_fields: args.changed_fields,
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

export async function emitPlannerGroupPurged(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  version_before: PlannerGroupPurged['payload']['version_before'];
  purged_at: PlannerGroupPurged['payload']['purged_at'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.group',
    aggregateId: args.group_id,
    eventType: 'planner.group.purged',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      version_before: args.version_before,
      purged_at: args.purged_at,
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
}): Promise<{ eventId: string }> {
  return emit({
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

export async function emitPlannerGroupMemberRoleChanged(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  user_id: Uuid;
  before_role: 'owner' | 'member';
  after_role: 'owner' | 'member';
}): Promise<{ eventId: string }> {
  return emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.group',
    aggregateId: args.group_id,
    eventType: 'planner.group.member.role-changed',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      user_id: args.user_id,
      before_role: args.before_role,
      after_role: args.after_role,
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
}): Promise<{ eventId: string }> {
  return emit({
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
  changed_fields: PlannerPlanUpdated['payload']['changed_fields'];
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
      changed_fields: args.changed_fields,
      version_before: args.version_before,
      version_after: args.version_after,
    },
  });
}

export async function emitPlannerPlanSyncStatusChanged(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  plan_id: Uuid;
  before_status: PlannerPlanSyncStatusChanged['payload']['before_status'];
  after_status: PlannerPlanSyncStatusChanged['payload']['after_status'];
  error: string | null;
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.plan',
    aggregateId: args.plan_id,
    eventType: 'planner.plan.sync-status-changed',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      tenant_id: args.tenant_id,
      group_id: args.group_id,
      plan_id: args.plan_id,
      before_status: args.before_status,
      after_status: args.after_status,
      error: args.error,
    },
  });
}

export async function emitPlannerTaskSyncStatusChanged(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  plan_id: Uuid;
  task_id: Uuid;
  before_status: PlannerTaskSyncStatusChanged['payload']['before_status'];
  after_status: PlannerTaskSyncStatusChanged['payload']['after_status'];
  error: string | null;
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.task',
    aggregateId: args.task_id,
    eventType: 'planner.task.sync-status-changed',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      tenant_id: args.tenant_id,
      group_id: args.group_id,
      plan_id: args.plan_id,
      task_id: args.task_id,
      before_status: args.before_status,
      after_status: args.after_status,
      error: args.error,
    },
  });
}

export async function emitPlannerPlanConflictResolved(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  plan_id: Uuid;
  decisions: PlannerPlanConflictResolved['payload']['decisions'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.plan',
    aggregateId: args.plan_id,
    eventType: 'planner.plan.conflict-resolved',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      tenant_id: args.tenant_id,
      group_id: args.group_id,
      plan_id: args.plan_id,
      decisions: args.decisions,
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
}): Promise<{ eventId: string }> {
  return emit({
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

export async function emitPlannerPlanPurged(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  plan_id: Uuid;
  version_before: PlannerPlanPurged['payload']['version_before'];
  purged_at: PlannerPlanPurged['payload']['purged_at'];
}): Promise<{ eventId: string }> {
  return emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.plan',
    aggregateId: args.plan_id,
    eventType: 'planner.plan.purged',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      plan_id: args.plan_id,
      version_before: args.version_before,
      purged_at: args.purged_at,
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

export async function emitPlannerPlanArchived(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  plan_id: Uuid;
  version_before: PlannerPlanArchived['payload']['version_before'];
  archived_at: PlannerPlanArchived['payload']['archived_at'];
}): Promise<{ eventId: string }> {
  return emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.plan',
    aggregateId: args.plan_id,
    eventType: 'planner.plan.archived',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      tenant_id: args.tenant_id,
      group_id: args.group_id,
      plan_id: args.plan_id,
      version_before: args.version_before,
      archived_at: args.archived_at,
    },
  });
}

export async function emitPlannerPlanUnarchived(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  plan_id: Uuid;
  version_after: PlannerPlanUnarchived['payload']['version_after'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.plan',
    aggregateId: args.plan_id,
    eventType: 'planner.plan.unarchived',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      tenant_id: args.tenant_id,
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
  deleted_task_ids: PlannerBucketDeleted['payload']['deleted_task_ids'];
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
      deleted_task_ids: args.deleted_task_ids,
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
  changed_fields: TaskChangedField[];
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
      changed_fields: args.changed_fields,
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

export async function emitPlannerTaskPurged(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  task_id: Uuid;
  plan_id: Uuid;
  version_before: PlannerTaskPurged['payload']['version_before'];
  purged_at: PlannerTaskPurged['payload']['purged_at'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.task',
    aggregateId: args.task_id,
    eventType: 'planner.task.purged',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      task_id: args.task_id,
      plan_id: args.plan_id,
      version_before: args.version_before,
      purged_at: args.purged_at,
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
  /** When set with a different `group_id`, both groups get an activity bump. */
  from_group_id?: Uuid;
  task_id: Uuid;
  /**
   * The task's plan at the time of emission. For cross-plan moves callers
   * pass the target (new) plan id and additionally distinguish the source
   * via `from_plan_id`. For in-plan moves `from_plan_id`/`to_plan_id` may
   * be omitted and default to `plan_id`.
   */
  plan_id: Uuid;
  from_plan_id?: Uuid;
  to_plan_id?: Uuid;
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
      from_group_id: args.from_group_id,
      task_id: args.task_id,
      plan_id: args.plan_id,
      from_plan_id: args.from_plan_id ?? args.plan_id,
      to_plan_id: args.to_plan_id ?? args.plan_id,
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
}): Promise<{ eventId: string }> {
  return emit({
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
}): Promise<{ eventId: string }> {
  return emit({
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
}): Promise<{ eventId: string }> {
  return emit({
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
}): Promise<{ eventId: string }> {
  return emit({
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
  order_hint: PlannerChecklistItemAdded['payload']['order_hint'];
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
      order_hint: args.order_hint,
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

// -----
// Native-parity (PR1)
// -----

export async function emitPlannerTaskReferenceAdded(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  task_id: Uuid;
  plan_id: Uuid;
  url: PlannerTaskReferenceAdded['payload']['url'];
  alias: PlannerTaskReferenceAdded['payload']['alias'];
  type: PlannerTaskReferenceAdded['payload']['type'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.task',
    aggregateId: args.task_id,
    eventType: 'planner.task.reference-added',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      tenant_id: args.tenant_id,
      group_id: args.group_id,
      task_id: args.task_id,
      plan_id: args.plan_id,
      url: args.url,
      alias: args.alias,
      type: args.type,
    },
  });
}

export async function emitPlannerTaskReferenceRemoved(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  task_id: Uuid;
  plan_id: Uuid;
  url: PlannerTaskReferenceRemoved['payload']['url'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.task',
    aggregateId: args.task_id,
    eventType: 'planner.task.reference-removed',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      tenant_id: args.tenant_id,
      group_id: args.group_id,
      task_id: args.task_id,
      plan_id: args.plan_id,
      url: args.url,
    },
  });
}

export async function emitPlannerTaskLinkAdded(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  reference_id: Uuid;
  source_task_id: Uuid;
  target_task_id: Uuid;
  source_plan_id: Uuid;
  target_plan_id: Uuid;
  kind: PlannerTaskLinkAdded['payload']['kind'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.task',
    aggregateId: args.source_task_id,
    eventType: 'planner.task.link-added',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      tenant_id: args.tenant_id,
      group_id: args.group_id,
      reference_id: args.reference_id,
      source_task_id: args.source_task_id,
      target_task_id: args.target_task_id,
      source_plan_id: args.source_plan_id,
      target_plan_id: args.target_plan_id,
      kind: args.kind,
    },
  });
}

export async function emitPlannerTaskLinkRemoved(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  reference_id: Uuid;
  source_task_id: Uuid;
  target_task_id: Uuid;
  source_plan_id: Uuid;
  target_plan_id: Uuid;
  kind: PlannerTaskLinkRemoved['payload']['kind'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.task',
    aggregateId: args.source_task_id,
    eventType: 'planner.task.link-removed',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      tenant_id: args.tenant_id,
      group_id: args.group_id,
      reference_id: args.reference_id,
      source_task_id: args.source_task_id,
      target_task_id: args.target_task_id,
      source_plan_id: args.source_plan_id,
      target_plan_id: args.target_plan_id,
      kind: args.kind,
    },
  });
}

export async function emitPlannerPlanCategoryDescriptionChanged(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  plan_id: Uuid;
  slot: PlannerPlanCategoryDescriptionChanged['payload']['slot'];
  before: PlannerPlanCategoryDescriptionChanged['payload']['before'];
  after: PlannerPlanCategoryDescriptionChanged['payload']['after'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.plan',
    aggregateId: args.plan_id,
    eventType: 'planner.plan.category-description-changed',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      tenant_id: args.tenant_id,
      group_id: args.group_id,
      plan_id: args.plan_id,
      slot: args.slot,
      before: args.before,
      after: args.after,
    },
  });
}

export async function emitPlannerLabelCategorySlotChanged(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  group_id: Uuid;
  plan_id: Uuid;
  label_id: Uuid;
  before: PlannerLabelCategorySlotChanged['payload']['before'];
  after: PlannerLabelCategorySlotChanged['payload']['after'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.label',
    aggregateId: args.label_id,
    eventType: 'planner.label.category-slot-changed',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      tenant_id: args.tenant_id,
      group_id: args.group_id,
      plan_id: args.plan_id,
      label_id: args.label_id,
      before: args.before,
      after: args.after,
    },
  });
}

// -----
// Task comments
// -----

export async function emitPlannerCommentCreated(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  comment_id: Uuid;
  task_id: Uuid;
  plan_id: Uuid;
  group_id: Uuid;
  author_id: Uuid;
  body: string;
  created_at: string;
}): Promise<void> {
  const payload: PlannerCommentCreated['payload'] = {
    actor: args.actor,
    comment_id: args.comment_id,
    task_id: args.task_id,
    plan_id: args.plan_id,
    group_id: args.group_id,
    author_id: args.author_id,
    body: args.body,
    created_at: args.created_at,
  };
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.comment',
    aggregateId: args.comment_id,
    eventType: 'planner.comment.created',
    eventVersion: 1,
    payload,
  });
}

export async function emitPlannerCommentUpdated(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  comment_id: Uuid;
  task_id: Uuid;
  plan_id: Uuid;
  group_id: Uuid;
  before_body: string;
  after_body: string;
  edited_at: string;
}): Promise<void> {
  const payload: PlannerCommentUpdated['payload'] = {
    actor: args.actor,
    comment_id: args.comment_id,
    task_id: args.task_id,
    plan_id: args.plan_id,
    group_id: args.group_id,
    before: { body: args.before_body },
    after: { body: args.after_body, edited_at: args.edited_at },
  };
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.comment',
    aggregateId: args.comment_id,
    eventType: 'planner.comment.updated',
    eventVersion: 1,
    payload,
  });
}

export async function emitPlannerCommentDeleted(args: {
  actor: PlannerEventActor;
  tenant_id: Uuid;
  comment_id: Uuid;
  task_id: Uuid;
  plan_id: Uuid;
  group_id: Uuid;
  author_id: Uuid;
}): Promise<void> {
  const payload: PlannerCommentDeleted['payload'] = {
    actor: args.actor,
    comment_id: args.comment_id,
    task_id: args.task_id,
    plan_id: args.plan_id,
    group_id: args.group_id,
    author_id: args.author_id,
  };
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.comment',
    aggregateId: args.comment_id,
    eventType: 'planner.comment.deleted',
    eventVersion: 1,
    payload,
  });
}

export async function emitPlannerGroupJoinRequested(args: {
  actor: PlannerEventActor;
  group_id: string;
  user_id: string;
  tenant_id: string;
}): Promise<{ eventId: string }> {
  const { eventId } = await emit({
    tenantId: args.tenant_id,
    aggregateType: 'planner.group',
    aggregateId: args.group_id,
    eventType: 'planner.group.join.requested',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      group_id: args.group_id,
      user_id: args.user_id,
      tenant_id: args.tenant_id,
    },
  });
  return { eventId };
}
