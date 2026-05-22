import type { SessionScope } from '@seta/core';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import { assigneeProjection, plans } from '../../db/schema.ts';
import type { PlanWithRollupsRow } from '../dto.ts';
import { requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';

export async function listGroupPlansWithRollups(input: {
  group_id: string;
  session: SessionScope;
}): Promise<PlanWithRollupsRow[]> {
  requirePermission(input.session, 'planner.plan.read');

  const db = plannerDb();
  const filter = groupFilterFor(input.session);

  const conditions = [
    eq(plans.tenant_id, input.session.tenant_id),
    eq(plans.group_id, input.group_id),
    isNull(plans.deleted_at),
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
      category_descriptions: plans.category_descriptions,
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
      version: plans.version,
      task_count: sql<number>`(SELECT COUNT(*)::int FROM planner.tasks WHERE plan_id = "planner"."plans"."id" AND deleted_at IS NULL)`,
      open_task_count: sql<number>`(SELECT COUNT(*)::int FROM planner.tasks WHERE plan_id = "planner"."plans"."id" AND deleted_at IS NULL AND percent_complete < 100 AND is_deferred = false)`,
      // Average percent_complete across non-deleted tasks, 0..1. Returns null when plan has no tasks.
      percent_complete_avg: sql<
        number | null
      >`(SELECT AVG(percent_complete)::float / 100 FROM planner.tasks WHERE plan_id = "planner"."plans"."id" AND deleted_at IS NULL)`,
      // Latest task due_at — used as the plan's "due" hint when no plan-level due exists.
      latest_due_at: sql<Date | null>`(SELECT MAX(due_at) FROM planner.tasks WHERE plan_id = "planner"."plans"."id" AND deleted_at IS NULL)`,
      owner_display_name: assigneeProjection.display_name,
    })
    .from(plans)
    .leftJoin(assigneeProjection, eq(assigneeProjection.user_id, plans.created_by))
    .where(and(...conditions))
    .orderBy(asc(plans.name));

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
      category_descriptions: (r.category_descriptions ?? {}) as Record<string, string>,
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
      version: r.version,
      task_count: taskCount,
      open_task_count: openCount,
      percent_complete: pct,
      latest_due_at: latestDue,
      owner_display_name: r.owner_display_name ?? null,
      status: deriveStatus({ percentComplete: pct, latestDue, now: new Date() }),
    };
  });
}

/**
 * Lightweight status heuristic — does not write to DB. The mockup shows On track / At risk /
 * Off track pills; we derive from progress vs time-to-due. No explicit plan_status field exists
 * yet (would require a schema change), so this is a read-time computation.
 */
function deriveStatus(input: {
  percentComplete: number | null;
  latestDue: string | null;
  now: Date;
}): 'on-track' | 'at-risk' | 'off-track' | null {
  if (input.percentComplete === null || input.latestDue === null) return null;
  const due = new Date(input.latestDue).getTime();
  const now = input.now.getTime();
  if (due <= now) {
    return input.percentComplete >= 1 ? 'on-track' : 'off-track';
  }
  // No created_at/start_at to anchor expected progress; use a simple rule:
  // - days-to-due <= 3 and progress < 80% → at-risk
  // - days-to-due <= 7 and progress < 50% → at-risk
  // - otherwise on-track
  const days = (due - now) / 86_400_000;
  if (days <= 3 && input.percentComplete < 0.8) return 'at-risk';
  if (days <= 7 && input.percentComplete < 0.5) return 'at-risk';
  return 'on-track';
}
