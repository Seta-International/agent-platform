import type { SessionScope } from '@seta/core';
import { eq } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { plans } from '../db/schema.ts';
import type { PlanRow } from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';
import { fetchCategoryDescriptions, planRowToDto } from './_plan-dto.ts';

export async function getPlan(input: { plan_id: string; session: SessionScope }): Promise<PlanRow> {
  const db = plannerDb();

  const [row] = await db.select().from(plans).where(eq(plans.id, input.plan_id)).limit(1);

  if (!row || row.deleted_at !== null) {
    throw new PlannerError('NOT_FOUND', 'Plan not found', { plan_id: input.plan_id });
  }

  if (row.tenant_id !== input.session.tenant_id) {
    throw new PlannerError('CROSS_TENANT', 'Plan belongs to another tenant', {
      plan_id: input.plan_id,
    });
  }

  await requirePermission(input.session, 'planner.plan.read', row.group_id);

  const filter = await groupFilterFor(input.session);
  if (filter !== null && !filter.includes(row.group_id)) {
    throw new PlannerError('FORBIDDEN', 'No access to group', { plan_id: input.plan_id });
  }

  const categoryDescriptions = await fetchCategoryDescriptions(db, row.id);
  return planRowToDto(row, categoryDescriptions);
}
