import { queryAudit, type SessionScope } from '@seta/core';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { assigneeProjection, buckets, plans, tasks } from '../db/schema.ts';
import type { GroupActivityResult } from '../dto.ts';
import { requirePermission } from '../rbac.ts';

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

  // queryAudit returns { rows, total } where total is the count across the same filter set
  const audit = await queryAudit({
    tenant_id: input.session.tenant_id,
    aggregate_ids: aggregateIds,
    from: input.cursor ? undefined : input.since,
    before_occurred_at,
    before_event_id,
    limit,
    offset: 0,
    sort_by: 'occurred_at',
    sort_dir: 'desc',
  });

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

  const items = audit.rows.map((r) => {
    const actorUserId =
      r.actor && typeof r.actor === 'object' && 'user_id' in r.actor
        ? String((r.actor as { user_id?: string }).user_id ?? '') || null
        : null;
    const targetUserId = extractTargetUserId(r.event_type, r.payload);
    const title = extractTitle(r.payload) ?? taskTitleById.get(r.aggregate_id) ?? null;
    const { before_state, after_state, changed_fields } = extractBeforeAfter(
      r.event_type,
      r.payload,
    );
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
  const has_more = items.length === limit;
  const next_cursor =
    has_more && lastItem
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
    has_more,
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
