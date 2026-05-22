import type { DomainEvent, NodeTx, SubscriberCtx, SubscriberDef } from '@seta/shared-types';
import { sql } from 'drizzle-orm';
import { pushEchoSuppressedCounter } from '../observability.ts';
import type { ResourceType } from './repo.ts';
import { createM365PlanLinkRepo } from './repo.ts';

const M365_SYSTEM_ID = 'integrations.m365';

// Per-event payload shapes are reproduced here (not imported from @seta/planner's
// events package) so this module stays inside its own public-surface bubble per
// the modular-monolith boundary rules. Only the fields each handler needs are typed.
interface ActorBearing {
  actor?: { type?: string; system_id?: string };
}

interface PlanIdBearing {
  plan_id: string;
}

interface TaskIdBearing {
  task_id: string;
}

interface PlanCreatedPayload extends ActorBearing {
  group_id: string;
  after: {
    plan_id: string;
    group_id: string;
    name: string;
    external_source: 'native' | 'm365';
  };
}

interface PlanUpdatedPayload extends ActorBearing, PlanIdBearing {
  changed_fields: string[];
}

interface PlanDeletedPayload extends ActorBearing, PlanIdBearing {}

interface PlanCategoryDescriptionChangedPayload extends ActorBearing, PlanIdBearing {}

interface BucketCreatedPayload extends ActorBearing {
  after: {
    bucket_id: string;
    plan_id: string;
    name: string;
    order_hint?: string | null;
  };
}

interface BucketUpdatedPayload extends ActorBearing, PlanIdBearing {
  bucket_id: string;
  before: Partial<{ name: string; order_hint: string | null }>;
  after: Partial<{ name: string; order_hint: string | null }>;
}

interface BucketDeletedPayload extends ActorBearing, PlanIdBearing {
  bucket_id: string;
}

interface TaskCreatedPayload extends ActorBearing {
  after: {
    task_id: string;
    plan_id: string;
    bucket_id: string | null;
    title: string;
    external_source: 'native' | 'm365';
  };
}

interface TaskUpdatedPayload extends ActorBearing, PlanIdBearing, TaskIdBearing {
  changed_fields: string[];
}

interface TaskDeletedPayload extends ActorBearing, PlanIdBearing, TaskIdBearing {}

interface TaskMovedPayload extends ActorBearing, PlanIdBearing, TaskIdBearing {
  before: { bucket_id: string | null; order_hint: string | null };
  after: { bucket_id: string | null; order_hint: string | null };
}

interface TaskCompletedPayload extends ActorBearing, PlanIdBearing, TaskIdBearing {}
interface TaskReopenedPayload extends ActorBearing, PlanIdBearing, TaskIdBearing {}
interface TaskAssignedPayload extends ActorBearing, PlanIdBearing, TaskIdBearing {
  user_id: string;
}
interface TaskUnassignedPayload extends ActorBearing, PlanIdBearing, TaskIdBearing {
  user_id: string;
}
interface TaskReferenceAddedPayload extends ActorBearing, PlanIdBearing, TaskIdBearing {
  url: string;
}
interface TaskReferenceRemovedPayload extends ActorBearing, PlanIdBearing, TaskIdBearing {
  url: string;
}

interface ChecklistAddedPayload extends ActorBearing, PlanIdBearing, TaskIdBearing {
  item_id: string;
}
interface ChecklistUpdatedPayload extends ActorBearing, PlanIdBearing, TaskIdBearing {
  item_id: string;
}
interface ChecklistRemovedPayload extends ActorBearing, PlanIdBearing, TaskIdBearing {
  item_id: string;
}

interface LabelAppliedPayload extends ActorBearing, PlanIdBearing, TaskIdBearing {
  label_id: string;
}
interface LabelUnappliedPayload extends ActorBearing, PlanIdBearing, TaskIdBearing {
  label_id: string;
}

function isEcho(payload: ActorBearing, tenantId: string): boolean {
  if (payload.actor?.type === 'system' && payload.actor.system_id === M365_SYSTEM_ID) {
    pushEchoSuppressedCounter.add(1, { tenant_id: tenantId });
    return true;
  }
  return false;
}

async function enqueueJob(
  tx: NodeTx,
  identifier: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.execute(
    sql`SELECT graphile_worker.add_job(${identifier}::text, ${JSON.stringify(payload)}::json)`,
  );
}

interface PushJobPayload {
  tenant_id: string;
  plan_id: string;
  resource_type: ResourceType;
  seta_id: string;
  changed_fields: string[];
}

interface PushDeleteJobPayload {
  tenant_id: string;
  plan_id: string;
  resource_type: 'plan' | 'bucket' | 'task';
  seta_id: string;
}

interface PushCreatePlanJobPayload {
  tenant_id: string;
  plan_id: string;
  group_id: string;
  name: string;
}

interface PushCreateBucketJobPayload {
  tenant_id: string;
  plan_id: string;
  bucket_id: string;
}

interface PushCreateTaskJobPayload {
  tenant_id: string;
  plan_id: string;
  task_id: string;
}

async function lookupPlanLinkId(tx: NodeTx, planId: string): Promise<string | null> {
  // biome-ignore lint/suspicious/noExplicitAny: NodeTx omits schema generic; structurally compatible with the repo's reads.
  const repo = createM365PlanLinkRepo({ db: tx as any });
  const link = await repo.findByPlan(planId);
  return link?.id ?? null;
}

async function isPlanLinked(tx: NodeTx, planId: string): Promise<boolean> {
  return (await lookupPlanLinkId(tx, planId)) !== null;
}

async function isGroupLinked(tx: NodeTx, tenantId: string, groupId: string): Promise<boolean> {
  const rows = await tx.execute(
    sql`SELECT 1 FROM integrations.m365_group_links
        WHERE tenant_id = ${tenantId} AND group_id = ${groupId} AND unlinked_at IS NULL
        LIMIT 1`,
  );
  // postgres-node returns { rows: [...] }
  // biome-ignore lint/suspicious/noExplicitAny: NodeTx.execute return type is provider-dependent
  return ((rows as any).rows ?? rows).length > 0;
}

async function enqueueUpdate(
  ctx: SubscriberCtx,
  tenantId: string,
  planId: string,
  resourceType: ResourceType,
  setaId: string,
  changedFields: string[],
): Promise<void> {
  if (!(await isPlanLinked(ctx.tx, planId))) return;
  await enqueueJob(ctx.tx, 'm365.plan.push', {
    tenant_id: tenantId,
    plan_id: planId,
    resource_type: resourceType,
    seta_id: setaId,
    changed_fields: changedFields,
  } satisfies PushJobPayload);
}

async function enqueueDelete(
  ctx: SubscriberCtx,
  tenantId: string,
  planId: string,
  resourceType: 'plan' | 'bucket' | 'task',
  setaId: string,
): Promise<void> {
  if (!(await isPlanLinked(ctx.tx, planId))) return;
  await enqueueJob(ctx.tx, 'm365.plan.push-delete', {
    tenant_id: tenantId,
    plan_id: planId,
    resource_type: resourceType,
    seta_id: setaId,
  } satisfies PushDeleteJobPayload);
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

async function handlePlanCreated(
  event: DomainEvent<PlanCreatedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  // Auto-create only fires for a native plan inside an M365-linked group.
  if (p.after.external_source !== 'native') return;
  if (!(await isGroupLinked(ctx.tx, event.tenantId, p.after.group_id))) return;
  await enqueueJob(ctx.tx, 'm365.plan.push-create-plan', {
    tenant_id: event.tenantId,
    plan_id: p.after.plan_id,
    group_id: p.after.group_id,
    name: p.after.name,
  } satisfies PushCreatePlanJobPayload);
}

async function handlePlanUpdated(
  event: DomainEvent<PlanUpdatedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  await enqueueUpdate(ctx, event.tenantId, p.plan_id, 'plan', p.plan_id, p.changed_fields);
}

async function handlePlanDeleted(
  event: DomainEvent<PlanDeletedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  await enqueueDelete(ctx, event.tenantId, p.plan_id, 'plan', p.plan_id);
}

async function handlePlanCategoryDescriptionChanged(
  event: DomainEvent<PlanCategoryDescriptionChangedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  await enqueueUpdate(ctx, event.tenantId, p.plan_id, 'planDetails', p.plan_id, [
    'categoryDescriptions',
  ]);
}

// ---------------------------------------------------------------------------
// Bucket
// ---------------------------------------------------------------------------

async function handleBucketCreated(
  event: DomainEvent<BucketCreatedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  if (!(await isPlanLinked(ctx.tx, p.after.plan_id))) return;
  await enqueueJob(ctx.tx, 'm365.plan.push-create-bucket', {
    tenant_id: event.tenantId,
    plan_id: p.after.plan_id,
    bucket_id: p.after.bucket_id,
  } satisfies PushCreateBucketJobPayload);
}

async function handleBucketUpdated(
  event: DomainEvent<BucketUpdatedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  const changed: string[] = [];
  if (p.after.name !== undefined) changed.push('name');
  if (p.after.order_hint !== undefined) changed.push('orderHint');
  if (changed.length === 0) return;
  await enqueueUpdate(ctx, event.tenantId, p.plan_id, 'bucket', p.bucket_id, changed);
}

async function handleBucketDeleted(
  event: DomainEvent<BucketDeletedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  await enqueueDelete(ctx, event.tenantId, p.plan_id, 'bucket', p.bucket_id);
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

// Maps Seta TaskUpdated changed_field names to Graph PATCH body field names.
// Returns undefined when the field has no Graph counterpart (e.g. skill_tags,
// review_state, is_deferred — Seta-only).
const TASK_FIELD_MAP: Record<string, { graphField: string; target: 'task' | 'taskDetails' }> = {
  title: { graphField: 'title', target: 'task' },
  description: { graphField: 'description', target: 'taskDetails' },
  bucket_id: { graphField: 'bucketId', target: 'task' },
  priority_number: { graphField: 'priority', target: 'task' },
  percent_complete: { graphField: 'percentComplete', target: 'task' },
  preview_type: { graphField: 'previewType', target: 'taskDetails' },
  start_at: { graphField: 'startDateTime', target: 'task' },
  due_at: { graphField: 'dueDateTime', target: 'task' },
  order_hint: { graphField: 'orderHint', target: 'task' },
  assignee_priority: { graphField: 'assigneePriority', target: 'task' },
};

async function handleTaskCreated(
  event: DomainEvent<TaskCreatedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  if (p.after.external_source !== 'native') return;
  if (!(await isPlanLinked(ctx.tx, p.after.plan_id))) return;
  await enqueueJob(ctx.tx, 'm365.plan.push-create-task', {
    tenant_id: event.tenantId,
    plan_id: p.after.plan_id,
    task_id: p.after.task_id,
  } satisfies PushCreateTaskJobPayload);
}

async function handleTaskUpdated(
  event: DomainEvent<TaskUpdatedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  const taskFields: string[] = [];
  const detailsFields: string[] = [];
  for (const f of p.changed_fields) {
    const m = TASK_FIELD_MAP[f];
    if (!m) continue;
    if (m.target === 'task') taskFields.push(m.graphField);
    else detailsFields.push(m.graphField);
  }
  if (taskFields.length > 0) {
    await enqueueUpdate(ctx, event.tenantId, p.plan_id, 'task', p.task_id, taskFields);
  }
  if (detailsFields.length > 0) {
    await enqueueUpdate(ctx, event.tenantId, p.plan_id, 'taskDetails', p.task_id, detailsFields);
  }
}

async function handleTaskDeleted(
  event: DomainEvent<TaskDeletedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  await enqueueDelete(ctx, event.tenantId, p.plan_id, 'task', p.task_id);
}

async function handleTaskMoved(
  event: DomainEvent<TaskMovedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  const taskFields: string[] = [];
  if (p.before.bucket_id !== p.after.bucket_id) taskFields.push('bucketId');
  if (p.before.order_hint !== p.after.order_hint) taskFields.push('orderHint');
  if (taskFields.length === 0) return;
  if (!(await isPlanLinked(ctx.tx, p.plan_id))) return;
  // task.orderHint lives on the bucketTaskBoardTaskFormat sub-resource; the
  // dispatcher splits the work between PATCH /tasks/{id} (bucketId) and
  // PATCH /tasks/{id}/bucketTaskBoardFormat (orderHint). We enqueue a single
  // 'task' push and let the dispatcher route on changed_fields.
  await enqueueUpdate(ctx, event.tenantId, p.plan_id, 'task', p.task_id, taskFields);
}

async function handleTaskCompleted(
  event: DomainEvent<TaskCompletedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  await enqueueUpdate(ctx, event.tenantId, p.plan_id, 'task', p.task_id, ['percentComplete']);
}

async function handleTaskReopened(
  event: DomainEvent<TaskReopenedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  await enqueueUpdate(ctx, event.tenantId, p.plan_id, 'task', p.task_id, ['percentComplete']);
}

async function handleTaskAssigned(
  event: DomainEvent<TaskAssignedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  await enqueueUpdate(ctx, event.tenantId, p.plan_id, 'task', p.task_id, ['assignments']);
}

async function handleTaskUnassigned(
  event: DomainEvent<TaskUnassignedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  await enqueueUpdate(ctx, event.tenantId, p.plan_id, 'task', p.task_id, ['assignments']);
}

async function handleTaskReferenceAdded(
  event: DomainEvent<TaskReferenceAddedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  await enqueueUpdate(ctx, event.tenantId, p.plan_id, 'taskDetails', p.task_id, ['references']);
}

async function handleTaskReferenceRemoved(
  event: DomainEvent<TaskReferenceRemovedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  await enqueueUpdate(ctx, event.tenantId, p.plan_id, 'taskDetails', p.task_id, ['references']);
}

// ---------------------------------------------------------------------------
// Checklist items
// ---------------------------------------------------------------------------

async function handleChecklistAdded(
  event: DomainEvent<ChecklistAddedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  await enqueueUpdate(ctx, event.tenantId, p.plan_id, 'taskDetails', p.task_id, ['checklist']);
}

async function handleChecklistUpdated(
  event: DomainEvent<ChecklistUpdatedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  await enqueueUpdate(ctx, event.tenantId, p.plan_id, 'taskDetails', p.task_id, ['checklist']);
}

async function handleChecklistRemoved(
  event: DomainEvent<ChecklistRemovedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  await enqueueUpdate(ctx, event.tenantId, p.plan_id, 'taskDetails', p.task_id, ['checklist']);
}

// ---------------------------------------------------------------------------
// Labels (apply/unapply → appliedCategories on the task)
// ---------------------------------------------------------------------------

async function handleLabelApplied(
  event: DomainEvent<LabelAppliedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  await enqueueUpdate(ctx, event.tenantId, p.plan_id, 'task', p.task_id, ['appliedCategories']);
}

async function handleLabelUnapplied(
  event: DomainEvent<LabelUnappliedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  if (isEcho(p, event.tenantId)) return;
  await enqueueUpdate(ctx, event.tenantId, p.plan_id, 'task', p.task_id, ['appliedCategories']);
}

// ---------------------------------------------------------------------------
// Subscriber registry
// ---------------------------------------------------------------------------

export function buildM365PlanPushSubscribers(): SubscriberDef[] {
  return [
    {
      event: 'planner.plan.created',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.plan-created',
      handler: handlePlanCreated as SubscriberDef['handler'],
    },
    {
      event: 'planner.plan.updated',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.plan-updated',
      handler: handlePlanUpdated as SubscriberDef['handler'],
    },
    {
      event: 'planner.plan.deleted',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.plan-deleted',
      handler: handlePlanDeleted as SubscriberDef['handler'],
    },
    {
      event: 'planner.plan.category-description-changed',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.category-description-changed',
      handler: handlePlanCategoryDescriptionChanged as SubscriberDef['handler'],
    },
    {
      event: 'planner.bucket.created',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.bucket-created',
      handler: handleBucketCreated as SubscriberDef['handler'],
    },
    {
      event: 'planner.bucket.updated',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.bucket-updated',
      handler: handleBucketUpdated as SubscriberDef['handler'],
    },
    {
      event: 'planner.bucket.deleted',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.bucket-deleted',
      handler: handleBucketDeleted as SubscriberDef['handler'],
    },
    {
      event: 'planner.task.created',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.task-created',
      handler: handleTaskCreated as SubscriberDef['handler'],
    },
    {
      event: 'planner.task.updated',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.task-updated',
      handler: handleTaskUpdated as SubscriberDef['handler'],
    },
    {
      event: 'planner.task.deleted',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.task-deleted',
      handler: handleTaskDeleted as SubscriberDef['handler'],
    },
    {
      event: 'planner.task.moved',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.task-moved',
      handler: handleTaskMoved as SubscriberDef['handler'],
    },
    {
      event: 'planner.task.completed',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.task-completed',
      handler: handleTaskCompleted as SubscriberDef['handler'],
    },
    {
      event: 'planner.task.reopened',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.task-reopened',
      handler: handleTaskReopened as SubscriberDef['handler'],
    },
    {
      event: 'planner.task.assigned',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.task-assigned',
      handler: handleTaskAssigned as SubscriberDef['handler'],
    },
    {
      event: 'planner.task.unassigned',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.task-unassigned',
      handler: handleTaskUnassigned as SubscriberDef['handler'],
    },
    {
      event: 'planner.task.reference-added',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.task-reference-added',
      handler: handleTaskReferenceAdded as SubscriberDef['handler'],
    },
    {
      event: 'planner.task.reference-removed',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.task-reference-removed',
      handler: handleTaskReferenceRemoved as SubscriberDef['handler'],
    },
    {
      event: 'planner.checklist_item.added',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.checklist-added',
      handler: handleChecklistAdded as SubscriberDef['handler'],
    },
    {
      event: 'planner.checklist_item.updated',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.checklist-updated',
      handler: handleChecklistUpdated as SubscriberDef['handler'],
    },
    {
      event: 'planner.checklist_item.removed',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.checklist-removed',
      handler: handleChecklistRemoved as SubscriberDef['handler'],
    },
    {
      event: 'planner.label.applied',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.label-applied',
      handler: handleLabelApplied as SubscriberDef['handler'],
    },
    {
      event: 'planner.label.unapplied',
      eventVersion: 1,
      subscription: 'integrations.m365.plan.push.label-unapplied',
      handler: handleLabelUnapplied as SubscriberDef['handler'],
    },
  ];
}
