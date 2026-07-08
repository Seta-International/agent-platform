import { and, eq, isNull } from 'drizzle-orm';
import { plannerDb, plans } from '../../../db/index.ts';

/**
 * Resolve every plan_id in the same group as `planId` (tenant-scoped).
 * Archived plans stay in scope — only soft-deleted plans are excluded.
 * Falls back to `[planId]` if the plan can't be found (e.g. already deleted).
 */
export async function resolveGroupPlanIds(input: {
  tenantId: string;
  planId: string;
}): Promise<string[]> {
  const db = plannerDb();

  const [plan] = await db
    .select({ group_id: plans.group_id })
    .from(plans)
    .where(and(eq(plans.id, input.planId), eq(plans.tenant_id, input.tenantId)));
  if (!plan) return [input.planId];

  const rows = await db
    .select({ id: plans.id })
    .from(plans)
    .where(
      and(
        eq(plans.group_id, plan.group_id),
        eq(plans.tenant_id, input.tenantId),
        isNull(plans.deleted_at),
      ),
    );
  return rows.map((r) => r.id);
}
