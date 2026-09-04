import type { SessionScope } from '@seta/core';
import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { groups, plans } from '../db/schema.ts';
import type { PlanRow } from '../dto.ts';
import { requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';
import { fetchCategoryDescriptionsMany, planRowToDto } from './_plan-dto.ts';

export async function listPlans(input: {
  group_id?: string;
  include_deleted?: boolean;
  include_archived?: boolean;
  /**
   * Opt back into plans owned by an archived (soft-deleted) group. Default false
   * for the same reason as listTasks (FUT-832): only the web UI browses them.
   * Unrelated to `include_archived`, which is about the plan's own archived_at.
   */
  include_archived_groups?: boolean;
  session: SessionScope;
}): Promise<PlanRow[]> {
  await requirePermission(input.session, 'planner.plan.read');

  const db = plannerDb();
  const filter = await groupFilterFor(input.session);

  const conditions = [eq(plans.tenant_id, input.session.tenant_id)];

  if (input.group_id !== undefined) {
    conditions.push(eq(plans.group_id, input.group_id));
  }

  if (input.include_archived) {
    // Only archived (non-deleted) plans.
    conditions.push(isNull(plans.deleted_at));
    conditions.push(isNotNull(plans.archived_at));
  } else if (!input.include_deleted) {
    // Default: active plans only.
    conditions.push(isNull(plans.deleted_at));
    conditions.push(isNull(plans.archived_at));
  }
  // include_deleted=true: no filter on deleted_at or archived_at (show everything).

  if (!input.include_archived_groups) {
    conditions.push(
      inArray(
        plans.group_id,
        db.select({ id: groups.id }).from(groups).where(isNull(groups.deleted_at)),
      ),
    );
  }

  if (filter !== null) {
    if (filter.length === 0) {
      return [];
    }
    conditions.push(inArray(plans.group_id, [...filter]));
  }

  const rows = await db
    .select()
    .from(plans)
    .where(and(...conditions))
    .orderBy(asc(plans.name));

  const categoryDescriptionsByPlan = await fetchCategoryDescriptionsMany(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((row) => planRowToDto(row, categoryDescriptionsByPlan.get(row.id) ?? {}));
}
