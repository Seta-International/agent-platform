import type { SessionScope } from '@seta/core';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { assigneeProjection, plans } from '../db/schema.ts';
import type { PlanWithRollupsRow } from '../dto.ts';
import { requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';
import { fetchCategoryDescriptionsMany } from './_plan-dto.ts';

// MS Planner 3-state progress buckets, expressed against the `progress` enum
// column (mirrors task-enums.ts's progressToPercent, inlined as SQL literals
// since these are raw aggregate expressions, not row-level reads).
const PROGRESS_PERCENT_CASE = sql`CASE progress WHEN 'not_started' THEN 0 WHEN 'in_progress' THEN 50 WHEN 'done' THEN 100 END`;

export async function listGroupPlansWithRollups(input: {
  group_id: string;
  session: SessionScope;
}): Promise<PlanWithRollupsRow[]> {
  await requirePermission(input.session, 'planner.plan.read');

  const db = plannerDb();
  const filter = await groupFilterFor(input.session);

  const conditions = [
    eq(plans.tenant_id, input.session.tenant_id),
    eq(plans.group_id, input.group_id),
    isNull(plans.deleted_at),
    isNull(plans.archived_at),
  ];

  if (filter !== null) {
    if (filter.length === 0 || !filter.includes(input.group_id)) {
      return [];
    }
    conditions.push(inArray(plans.group_id, [...filter]));
  }

  const rows = await db
    .select({
      id: plans.id,
      tenant_id: plans.tenant_id,
      group_id: plans.group_id,
      name: plans.name,
      external_source: plans.external_source,
      external_id: plans.external_id,
      external_etag: plans.external_etag,
      external_synced_at: plans.external_synced_at,
      sync_status: plans.sync_status,
      last_error: plans.last_error,
      created_by: plans.created_by,
      created_at: plans.created_at,
      updated_at: plans.updated_at,
      deleted_at: plans.deleted_at,
      archived_at: plans.archived_at,
      version: plans.version,
      task_count: sql<number>`(SELECT COUNT(*)::int FROM planner.tasks WHERE plan_id = "planner"."plans"."id" AND deleted_at IS NULL)`,
      open_task_count: sql<number>`(SELECT COUNT(*)::int FROM planner.tasks WHERE plan_id = "planner"."plans"."id" AND deleted_at IS NULL AND progress <> 'done' AND is_deferred = false)`,
      // MS Planner 3-state progress buckets, across non-deleted tasks.
      not_started_count: sql<number>`(SELECT COUNT(*)::int FROM planner.tasks WHERE plan_id = "planner"."plans"."id" AND deleted_at IS NULL AND progress = 'not_started')`,
      in_progress_count: sql<number>`(SELECT COUNT(*)::int FROM planner.tasks WHERE plan_id = "planner"."plans"."id" AND deleted_at IS NULL AND progress = 'in_progress')`,
      completed_count: sql<number>`(SELECT COUNT(*)::int FROM planner.tasks WHERE plan_id = "planner"."plans"."id" AND deleted_at IS NULL AND progress = 'done')`,
      // Average percent_complete across non-deleted tasks, 0..1. Returns null when plan has no tasks.
      percent_complete_avg: sql<
        number | null
      >`(SELECT AVG(${PROGRESS_PERCENT_CASE})::float / 100 FROM planner.tasks WHERE plan_id = "planner"."plans"."id" AND deleted_at IS NULL)`,
      // Latest task due_at — used as the plan's "due" hint when no plan-level due exists.
      latest_due_at: sql<Date | null>`(SELECT MAX(due_at) FROM planner.tasks WHERE plan_id = "planner"."plans"."id" AND deleted_at IS NULL)`,
      owner_display_name: assigneeProjection.display_name,
    })
    .from(plans)
    .leftJoin(assigneeProjection, eq(assigneeProjection.user_id, plans.created_by))
    .where(and(...conditions))
    .orderBy(asc(plans.name));

  const categoryDescriptionsByPlan = await fetchCategoryDescriptionsMany(
    db,
    rows.map((r) => r.id),
  );

  return rows.map((r) => {
    const taskCount = Number(r.task_count);
    const openCount = Number(r.open_task_count);
    const pct = r.percent_complete_avg !== null ? Number(r.percent_complete_avg) : null;
    const latestDue = r.latest_due_at ? new Date(r.latest_due_at).toISOString() : null;
    return {
      id: r.id,
      tenant_id: r.tenant_id,
      group_id: r.group_id,
      name: r.name,
      category_descriptions: categoryDescriptionsByPlan.get(r.id) ?? {},
      external_source: r.external_source as PlanWithRollupsRow['external_source'],
      external_id: r.external_id,
      external_etag: r.external_etag,
      external_synced_at: r.external_synced_at ? r.external_synced_at.toISOString() : null,
      sync_status: r.sync_status as PlanWithRollupsRow['sync_status'],
      last_error: r.last_error,
      created_by: r.created_by,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
      deleted_at: r.deleted_at ? r.deleted_at.toISOString() : null,
      archived_at: r.archived_at ? r.archived_at.toISOString() : null,
      version: r.version,
      task_count: taskCount,
      open_task_count: openCount,
      not_started_count: Number(r.not_started_count),
      in_progress_count: Number(r.in_progress_count),
      completed_count: Number(r.completed_count),
      percent_complete: pct,
      latest_due_at: latestDue,
      owner_display_name: r.owner_display_name ?? null,
    };
  });
}
