import { emit } from '@seta/core/events';
import type { DomainEvent, SubscriberCtx } from '@seta/shared-types';

import { and, eq, ne } from 'drizzle-orm';
import type {
  PlannerBucketCreated,
  PlannerBucketDeleted,
  PlannerGroupCreated,
  PlannerGroupDeleted,
  PlannerGroupMemberAdded,
  PlannerGroupMemberRoleChanged,
  PlannerPlanCreated,
  PlannerPlanDeleted,
  PlannerTaskAssigned,
  PlannerTaskCompleted,
  PlannerTaskCreated,
  PlannerTaskDeleted,
  PlannerTaskReopened,
  PlannerTaskUnassigned,
} from '../../events/types.ts';
import { groupMembers } from '../db/schema.ts';

/**
 * Common helper to request a notification via outbox emit.
 * The `notifications` module listens to `notification.requested` and handles delivery.
 */
async function requestNotification(
  tenantId: string,
  eventType: string,
  userIds: string[],
  sourceEventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (userIds.length === 0) return;
  await emit({
    tenantId,
    aggregateType: 'notification',
    aggregateId: sourceEventId,
    eventType: 'notification.requested',
    eventVersion: 1,
    payload: {
      target_event_type: eventType,
      target_payload: payload,
      user_ids: userIds,
      source_event_id: sourceEventId,
    },
  });
}

/**
 * Fetch all group members except the actor who triggered the event.
 */
async function getGroupMembersToNotify(
  ctx: SubscriberCtx,
  groupId: string,
  actorUserId: string | null,
): Promise<string[]> {
  // If no actor, return all members
  if (!actorUserId) {
    const members = await ctx.tx
      .select({ user_id: groupMembers.user_id })
      .from(groupMembers)
      .where(eq(groupMembers.group_id, groupId));
    return members.map((m) => m.user_id);
  }

  // Exclude actor from query (DB-level optimization)
  const members = await ctx.tx
    .select({ user_id: groupMembers.user_id })
    .from(groupMembers)
    .where(and(eq(groupMembers.group_id, groupId), ne(groupMembers.user_id, actorUserId)));

  return members.map((m) => m.user_id);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function handleTaskCreated(
  e: DomainEvent<PlannerTaskCreated['payload']>,
  ctx: SubscriberCtx,
): Promise<void> {
  const { group_id, after: task } = e.payload;
  const userIds = await getGroupMembersToNotify(ctx, group_id, e.payload.actor.user_id);
  await requestNotification(e.tenantId, e.eventType, userIds, e.id, {
    title: `Task created: ${task.title}`,
    body: `A new task was created.`,
    task_id: task.task_id,
    plan_id: task.plan_id,
    group_id: task.group_id,
  });
}

export async function handleTaskDeleted(
  e: DomainEvent<PlannerTaskDeleted['payload']>,
  ctx: SubscriberCtx,
): Promise<void> {
  const { group_id, task_id, plan_id } = e.payload;
  const userIds = await getGroupMembersToNotify(ctx, group_id, e.payload.actor.user_id);
  await requestNotification(e.tenantId, e.eventType, userIds, e.id, {
    title: `Task deleted`,
    body: `A task was deleted from the plan.`,
    task_id,
    plan_id,
    group_id,
  });
}

export async function handleTaskAssigned(
  e: DomainEvent<PlannerTaskAssigned['payload']>,
  _ctx: SubscriberCtx,
): Promise<void> {
  const { user_id, task_id, plan_id, group_id } = e.payload;
  await requestNotification(e.tenantId, e.eventType, [user_id], e.id, {
    title: `You were assigned to a task`,
    body: `You have been assigned to a task.`,
    task_id,
    plan_id,
    group_id,
  });
}

export async function handleTaskUnassigned(
  e: DomainEvent<PlannerTaskUnassigned['payload']>,
  _ctx: SubscriberCtx,
): Promise<void> {
  const { user_id, task_id, plan_id, group_id } = e.payload;
  await requestNotification(e.tenantId, e.eventType, [user_id], e.id, {
    title: `You were unassigned from a task`,
    body: `You have been unassigned from a task.`,
    task_id,
    plan_id,
    group_id,
  });
}

export async function handleTaskCompleted(
  e: DomainEvent<PlannerTaskCompleted['payload']>,
  ctx: SubscriberCtx,
): Promise<void> {
  const { group_id, task_id, plan_id } = e.payload;
  const userIds = await getGroupMembersToNotify(ctx, group_id, e.payload.actor.user_id);
  await requestNotification(e.tenantId, e.eventType, userIds, e.id, {
    title: `Task completed`,
    body: `A task was marked as completed.`,
    task_id,
    plan_id,
    group_id,
  });
}

export async function handleTaskReopened(
  e: DomainEvent<PlannerTaskReopened['payload']>,
  ctx: SubscriberCtx,
): Promise<void> {
  const { group_id, task_id, plan_id } = e.payload;
  const userIds = await getGroupMembersToNotify(ctx, group_id, e.payload.actor.user_id);
  await requestNotification(e.tenantId, e.eventType, userIds, e.id, {
    title: `Task reopened`,
    body: `A task was reopened.`,
    task_id,
    plan_id,
    group_id,
  });
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export async function handleGroupCreated(
  e: DomainEvent<PlannerGroupCreated['payload']>,
  ctx: SubscriberCtx,
): Promise<void> {
  const { group_id, after: group } = e.payload;
  const userIds = await getGroupMembersToNotify(ctx, group_id, e.payload.actor.user_id);
  await requestNotification(e.tenantId, e.eventType, userIds, e.id, {
    title: `Group created: ${group.name}`,
    body: `A new group was created.`,
    group_id,
  });
}

export async function handleGroupDeleted(
  e: DomainEvent<PlannerGroupDeleted['payload']>,
  ctx: SubscriberCtx,
): Promise<void> {
  const { group_id } = e.payload;
  const userIds = await getGroupMembersToNotify(ctx, group_id, e.payload.actor.user_id);
  await requestNotification(e.tenantId, e.eventType, userIds, e.id, {
    title: `Group deleted`,
    body: `A group was deleted.`,
    group_id,
  });
}

export async function handleGroupMemberAdded(
  e: DomainEvent<PlannerGroupMemberAdded['payload']>,
  _ctx: SubscriberCtx,
): Promise<void> {
  const { user_id, group_id } = e.payload;
  await requestNotification(e.tenantId, e.eventType, [user_id], e.id, {
    title: `You were added to a group`,
    body: `You have been added to a group.`,
    group_id,
  });
}

export async function handleGroupMemberRoleChanged(
  e: DomainEvent<PlannerGroupMemberRoleChanged['payload']>,
  _ctx: SubscriberCtx,
): Promise<void> {
  const { user_id, group_id, after_role } = e.payload;
  await requestNotification(e.tenantId, e.eventType, [user_id], e.id, {
    title: `Your group role changed`,
    body: `Your role was changed to ${after_role}.`,
    group_id,
  });
}

// ---------------------------------------------------------------------------
// Plans & Buckets
// ---------------------------------------------------------------------------

export async function handlePlanCreated(
  e: DomainEvent<PlannerPlanCreated['payload']>,
  ctx: SubscriberCtx,
): Promise<void> {
  const { group_id, after: plan } = e.payload;
  const userIds = await getGroupMembersToNotify(ctx, group_id, e.payload.actor.user_id);
  await requestNotification(e.tenantId, e.eventType, userIds, e.id, {
    title: `Plan created: ${plan.name}`,
    body: `A new plan was created.`,
    plan_id: plan.plan_id,
    group_id,
  });
}

export async function handlePlanDeleted(
  e: DomainEvent<PlannerPlanDeleted['payload']>,
  ctx: SubscriberCtx,
): Promise<void> {
  const { group_id, plan_id } = e.payload;
  const userIds = await getGroupMembersToNotify(ctx, group_id, e.payload.actor.user_id);
  await requestNotification(e.tenantId, e.eventType, userIds, e.id, {
    title: `Plan deleted`,
    body: `A plan was deleted.`,
    plan_id,
    group_id,
  });
}

export async function handleBucketCreated(
  e: DomainEvent<PlannerBucketCreated['payload']>,
  ctx: SubscriberCtx,
): Promise<void> {
  const { group_id, after: bucket } = e.payload;
  const userIds = await getGroupMembersToNotify(ctx, group_id, e.payload.actor.user_id);
  await requestNotification(e.tenantId, e.eventType, userIds, e.id, {
    title: `Bucket created: ${bucket.name}`,
    body: `A new bucket was created.`,
    plan_id: bucket.plan_id,
    group_id,
  });
}

export async function handleBucketDeleted(
  e: DomainEvent<PlannerBucketDeleted['payload']>,
  ctx: SubscriberCtx,
): Promise<void> {
  const { group_id, plan_id } = e.payload;
  const userIds = await getGroupMembersToNotify(ctx, group_id, e.payload.actor.user_id);
  await requestNotification(e.tenantId, e.eventType, userIds, e.id, {
    title: `Bucket deleted`,
    body: `A bucket was deleted.`,
    plan_id,
    group_id,
  });
}
