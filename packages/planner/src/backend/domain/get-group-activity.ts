import { queryAudit, type SessionScope } from '@seta/core';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import { assigneeProjection, buckets, plans, tasks } from '../../db/schema.ts';
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
  since: string;
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

  // queryAudit returns { rows, total } where total is the count across the same filter set
  const audit = await queryAudit({
    tenant_id: input.session.tenant_id,
    aggregate_ids: aggregateIds,
    from: input.since,
    limit,
    offset: 0,
    sort_by: 'occurred_at',
    sort_dir: 'desc',
  });

  // Resolve display names for the actors that appear in the result set
  const actorIds = new Set<string>();
  for (const r of audit.rows) {
    const userId =
      (r.actor && typeof r.actor === 'object' && 'user_id' in r.actor
        ? String((r.actor as { user_id?: string }).user_id ?? '')
        : '') || '';
    if (userId) actorIds.add(userId);
  }
  const actorRows =
    actorIds.size > 0
      ? await db
          .select({
            user_id: assigneeProjection.user_id,
            display_name: assigneeProjection.display_name,
          })
          .from(assigneeProjection)
          .where(inArray(assigneeProjection.user_id, [...actorIds]))
      : [];
  const nameById = new Map(actorRows.map((a) => [a.user_id, a.display_name]));

  const items = audit.rows.map((r) => {
    const userId =
      r.actor && typeof r.actor === 'object' && 'user_id' in r.actor
        ? String((r.actor as { user_id?: string }).user_id ?? '') || null
        : null;
    const title = extractTitle(r.payload);
    return {
      event_id: r.event_id,
      event_type: r.event_type,
      verb: verbFor(r.event_type),
      target_title: title,
      occurred_at: r.occurred_at,
      actor_user_id: userId,
      actor_display_name: userId ? (nameById.get(userId) ?? null) : null,
    };
  });

  return {
    count: audit.total,
    items,
  };
}

function verbFor(eventType: string): string {
  // Mapping covers the planner event taxonomy. Falls back to the verb (last segment) of the type.
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
  return null;
}
