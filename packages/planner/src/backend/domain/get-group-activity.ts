import { type AuditRow, queryAudit, type SessionScope } from '@seta/core';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { assigneeProjection, buckets, plans, tasks } from '../db/schema.ts';
import type { GroupActivityResult } from '../dto.ts';
import { requirePermission } from '../rbac.ts';
import { isSignificant } from './activity-significance.ts';

/**
 * Aggregates events from core.events for everything inside a group (the group itself, its plans,
 * its buckets, its tasks). Returns a window count for the stat card and the most recent items for
 * the activity rail.
 *
 * Display names come from planner.assignee_projection — no cross-module joins; we resolve in JS
 * after queryAudit returns.
 */
export async function getGroupActivity(input: {
  group_id: string;
  /** Window start (ISO). The count + items both respect this. */
  since?: string;
  /** Opaque keyset cursor for feed pagination. */
  cursor?: string;
  /** Cap on items returned for the rail. Count is taken from the same window. */
  limit?: number;
  session: SessionScope;
}): Promise<GroupActivityResult> {
  requirePermission(input.session, 'planner.group.read');

  const limit = input.limit ?? 8;
  const db = plannerDb();

  // Resolve every aggregate ID this group touches: the group itself, plans, buckets, tasks
  // (non-deleted). We cap to a sane upper bound to keep the IN list under PG limits.
  const [planRows, bucketRows, taskRows] = await Promise.all([
    db
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.group_id, input.group_id), isNull(plans.deleted_at))),
    db
      .select({ id: buckets.id })
      .from(buckets)
      .innerJoin(plans, eq(plans.id, buckets.plan_id))
      .where(and(eq(plans.group_id, input.group_id), isNull(buckets.deleted_at))),
    db
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(plans, eq(plans.id, tasks.plan_id))
      .where(and(eq(plans.group_id, input.group_id), isNull(tasks.deleted_at))),
  ]);

  const aggregateIds = [
    input.group_id,
    ...planRows.map((r) => r.id),
    ...bucketRows.map((r) => r.id),
    ...taskRows.map((r) => r.id),
  ];

  // Decode cursor for feed path
  let before_occurred_at: string | undefined;
  let before_event_id: string | undefined;
  if (input.cursor) {
    const decoded = JSON.parse(atob(input.cursor)) as {
      occurred_at: string;
      event_id: string;
    };
    before_occurred_at = decoded.occurred_at;
    before_event_id = decoded.event_id;
  }

  // Bounded fetch-filter loop: keep significant rows across as many audit batches as
  // needed so a page never short-fills due to dropped move/reorder noise. The guard caps
  // worst-case iterations (e.g. a long run of same-bucket reorders).
  const FETCH_BUFFER = 10;
  const batchSize = limit + FETCH_BUFFER;
  const kept: AuditRow[] = [];
  let firstTotal = 0;
  let cursorOcc = before_occurred_at;
  let cursorId = before_event_id;
  let exhausted = false;
  let guard = 0;

  while (kept.length <= limit && !exhausted && guard < 20) {
    guard++;
    const batch = await queryAudit({
      tenant_id: input.session.tenant_id,
      aggregate_ids: aggregateIds,
      from: input.cursor ? undefined : input.since,
      before_occurred_at: cursorOcc,
      before_event_id: cursorId,
      limit: batchSize,
      offset: 0,
      sort_by: 'occurred_at',
      sort_dir: 'desc',
    });
    if (guard === 1) firstTotal = batch.total;
    if (batch.rows.length < batchSize) exhausted = true;
    for (const r of batch.rows) {
      if (isSignificant(r.event_type, r.payload)) kept.push(r);
    }
    const lastRaw = batch.rows[batch.rows.length - 1];
    if (!lastRaw) {
      exhausted = true;
    } else {
      cursorOcc = lastRaw.occurred_at;
      cursorId = lastRaw.event_id;
    }
  }

  const hasMore = kept.length > limit;
  // `count` stays the first batch's raw total (includes filtered noise) — an approximate
  // window count for the stat card; a precise filtered count would require a full scan.
  const audit = { rows: kept.slice(0, limit), total: firstTotal };

  // Collect actor and target user IDs for a single batch name lookup
  const allUserIds = new Set<string>();
  for (const r of audit.rows) {
    const actorUserId =
      (r.actor && typeof r.actor === 'object' && 'user_id' in r.actor
        ? String((r.actor as { user_id?: string }).user_id ?? '')
        : '') || '';
    if (actorUserId) allUserIds.add(actorUserId);

    const targetUserId = extractTargetUserId(r.event_type, r.payload);
    if (targetUserId) allUserIds.add(targetUserId);
  }
  const userRows =
    allUserIds.size > 0
      ? await db
          .select({
            user_id: assigneeProjection.user_id,
            display_name: assigneeProjection.display_name,
          })
          .from(assigneeProjection)
          .where(inArray(assigneeProjection.user_id, [...allUserIds]))
      : [];
  const nameById = new Map(userRows.map((a) => [a.user_id, a.display_name]));

  // Batch-fetch task titles for events whose payloads don't carry the task title
  const taskIdsNeedingTitle = new Set<string>();
  for (const r of audit.rows) {
    if (TASK_TITLE_EVENT_TYPES.has(r.event_type)) {
      taskIdsNeedingTitle.add(r.aggregate_id);
    }
  }
  const taskTitleRows =
    taskIdsNeedingTitle.size > 0
      ? await db
          .select({ id: tasks.id, title: tasks.title })
          .from(tasks)
          .where(inArray(tasks.id, [...taskIdsNeedingTitle]))
      : [];
  const taskTitleById = new Map(taskTitleRows.map((t) => [t.id, t.title]));

  // Bucket + plan names for task.moved labels (from->to). IDs come from the move payload.
  const movedBucketIds = new Set<string>();
  const movedPlanIds = new Set<string>();
  for (const r of audit.rows) {
    if (r.event_type !== 'planner.task.moved' || !r.payload) continue;
    const before = (r.payload.before ?? null) as { bucket_id?: string | null } | null;
    const after = (r.payload.after ?? null) as { bucket_id?: string | null } | null;
    if (before?.bucket_id) movedBucketIds.add(before.bucket_id);
    if (after?.bucket_id) movedBucketIds.add(after.bucket_id);
    const fromPlan = r.payload.from_plan_id;
    const toPlan = r.payload.to_plan_id;
    if (typeof fromPlan === 'string') movedPlanIds.add(fromPlan);
    if (typeof toPlan === 'string') movedPlanIds.add(toPlan);
  }

  const bucketNameRows =
    movedBucketIds.size > 0
      ? await db
          .select({ id: buckets.id, name: buckets.name })
          .from(buckets)
          .where(inArray(buckets.id, [...movedBucketIds]))
      : [];
  const bucketNameById = new Map(bucketNameRows.map((b) => [b.id, b.name]));

  const planNameRows =
    movedPlanIds.size > 0
      ? await db
          .select({ id: plans.id, name: plans.name })
          .from(plans)
          .where(inArray(plans.id, [...movedPlanIds]))
      : [];
  const planNameById = new Map(planNameRows.map((p) => [p.id, p.name]));

  function moveStates(payload: Record<string, unknown> | null): {
    before_state: Record<string, unknown> | null;
    after_state: Record<string, unknown> | null;
    changed_fields: string[] | null;
  } {
    if (!payload) return { before_state: null, after_state: null, changed_fields: null };
    const fromPlan = payload.from_plan_id;
    const toPlan = payload.to_plan_id;
    if (typeof fromPlan === 'string' && typeof toPlan === 'string' && fromPlan !== toPlan) {
      return {
        before_state: { plan_id: fromPlan, plan_name: planNameById.get(fromPlan) ?? null },
        after_state: { plan_id: toPlan, plan_name: planNameById.get(toPlan) ?? null },
        changed_fields: ['plan_id'],
      };
    }
    const before = (payload.before ?? null) as { bucket_id?: string | null } | null;
    const after = (payload.after ?? null) as { bucket_id?: string | null } | null;
    const beforeBucket = before?.bucket_id ?? null;
    const afterBucket = after?.bucket_id ?? null;
    return {
      before_state: {
        bucket_id: beforeBucket,
        bucket_name: beforeBucket ? (bucketNameById.get(beforeBucket) ?? null) : null,
      },
      after_state: {
        bucket_id: afterBucket,
        bucket_name: afterBucket ? (bucketNameById.get(afterBucket) ?? null) : null,
      },
      changed_fields: ['bucket_id'],
    };
  }

  const items = audit.rows.map((r) => {
    const actorUserId =
      r.actor && typeof r.actor === 'object' && 'user_id' in r.actor
        ? String((r.actor as { user_id?: string }).user_id ?? '') || null
        : null;
    const targetUserId = extractTargetUserId(r.event_type, r.payload);
    const title = extractTitle(r.payload) ?? taskTitleById.get(r.aggregate_id) ?? null;
    const { before_state, after_state, changed_fields } =
      r.event_type === 'planner.task.moved'
        ? moveStates(r.payload)
        : extractBeforeAfter(r.event_type, r.payload);
    return {
      event_id: r.event_id,
      event_type: r.event_type,
      verb: verbFor(r.event_type),
      target_title: title,
      occurred_at: r.occurred_at,
      actor_user_id: actorUserId,
      actor_display_name: actorUserId ? (nameById.get(actorUserId) ?? null) : null,
      target_user_id: targetUserId,
      target_user_display_name: targetUserId ? (nameById.get(targetUserId) ?? null) : null,
      before_state,
      after_state,
      changed_fields,
    };
  });

  const lastItem = items[items.length - 1];
  const next_cursor =
    hasMore && lastItem
      ? btoa(
          JSON.stringify({
            occurred_at: lastItem.occurred_at,
            event_id: lastItem.event_id,
          }),
        )
      : undefined;

  return {
    count: audit.total,
    items,
    next_cursor,
    has_more: hasMore,
  };
}

/** Events whose payloads carry `user_id` for the person being acted on. */
const TARGET_USER_EVENT_TYPES = new Set([
  'planner.group.member.added',
  'planner.group.member.removed',
  'planner.group.member.role-changed',
  'planner.task.assigned',
  'planner.task.unassigned',
]);

/** Task-aggregate events that don't embed the task title in the payload. */
const TASK_TITLE_EVENT_TYPES = new Set([
  'planner.task.completed',
  'planner.task.reopened',
  'planner.task.assigned',
  'planner.task.unassigned',
  'planner.task.deleted',
  'planner.task.restored',
  'planner.task.moved',
  'planner.task.label.applied',
  'planner.task.label.unapplied',
  'planner.task.reference.added',
  'planner.task.reference.removed',
  'planner.task.checklist.item.added',
  'planner.task.checklist.item.updated',
  'planner.task.checklist.item.removed',
]);

function extractTargetUserId(
  eventType: string,
  payload: Record<string, unknown> | null,
): string | null {
  if (!payload || !TARGET_USER_EVENT_TYPES.has(eventType)) return null;
  return typeof payload.user_id === 'string' ? payload.user_id : null;
}

function extractBeforeAfter(
  eventType: string,
  payload: Record<string, unknown> | null,
): {
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  changed_fields: string[] | null;
} {
  const empty = { before_state: null, after_state: null, changed_fields: null };
  if (!payload) return empty;

  if (eventType === 'planner.group.member.role-changed') {
    return {
      before_state: { role: payload.before_role },
      after_state: { role: payload.after_role },
      changed_fields: ['role'],
    };
  }

  if (
    eventType === 'planner.group.updated' ||
    eventType === 'planner.plan.updated' ||
    eventType === 'planner.bucket.updated' ||
    eventType === 'planner.task.updated'
  ) {
    return {
      before_state: isObj(payload.before) ? payload.before : null,
      after_state: isObj(payload.after) ? payload.after : null,
      changed_fields: Array.isArray(payload.changed_fields)
        ? (payload.changed_fields as string[])
        : null,
    };
  }

  return empty;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function verbFor(eventType: string): string {
  const map: Record<string, string> = {
    'planner.group.created': 'created group',
    'planner.group.updated': 'updated group',
    'planner.group.deleted': 'deleted group',
    'planner.group.restored': 'restored group',
    'planner.group.member.added': 'added member',
    'planner.group.member.removed': 'removed member',
    'planner.group.member.role-changed': 'changed member role',
    'planner.plan.created': 'created plan',
    'planner.plan.updated': 'updated plan',
    'planner.plan.deleted': 'deleted plan',
    'planner.plan.restored': 'restored plan',
    'planner.bucket.created': 'created bucket',
    'planner.bucket.updated': 'updated bucket',
    'planner.bucket.deleted': 'deleted bucket',
    'planner.bucket.moved': 'moved bucket',
    'planner.task.created': 'created task',
    'planner.task.updated': 'updated task',
    'planner.task.deleted': 'deleted task',
    'planner.task.restored': 'restored task',
    'planner.task.moved': 'moved task',
    'planner.task.completed': 'completed task',
    'planner.task.reopened': 'reopened task',
    'planner.task.assigned': 'assigned task',
    'planner.task.unassigned': 'unassigned task',
    'planner.task.label.applied': 'labeled task',
    'planner.task.label.unapplied': 'removed label from task',
    'planner.task.reference.added': 'added reference to task',
    'planner.task.reference.removed': 'removed reference from task',
    'planner.task.checklist.item.added': 'added checklist item',
    'planner.task.checklist.item.updated': 'updated checklist item',
    'planner.task.checklist.item.removed': 'removed checklist item',
  };
  if (map[eventType]) return map[eventType];
  const tail = eventType.split('.').pop() ?? eventType;
  return tail.replace(/[-_]/g, ' ');
}

function extractTitle(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  if (typeof payload.title === 'string') return payload.title;
  if (typeof payload.name === 'string') return payload.name;
  // Nested after state (task.created, plan.created, group.created, bucket.created)
  if (isObj(payload.after)) {
    if (typeof payload.after.title === 'string') return payload.after.title;
    if (typeof payload.after.name === 'string') return payload.after.name;
  }
  return null;
}
