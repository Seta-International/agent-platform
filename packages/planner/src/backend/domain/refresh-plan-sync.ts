import type { SessionScope } from '@seta/core';
import { and, eq, isNull } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import { plans } from '../../db/schema.ts';
import type { RefreshPlanSyncInput } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

export interface RefreshPlanSyncDeps {
  enqueuePlanPull: (payload: {
    tenant_id: string;
    plan_id: string;
    full: boolean;
  }) => Promise<void>;
}

export async function refreshPlanSync(
  input: RefreshPlanSyncInput & { session: SessionScope },
  deps: RefreshPlanSyncDeps,
): Promise<void> {
  const db = plannerDb();
  const [existing] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, input.plan_id), isNull(plans.deleted_at)))
    .limit(1);
  if (!existing) throw new PlannerError('NOT_FOUND', 'Plan not found', { plan_id: input.plan_id });
  if (existing.tenant_id !== input.session.tenant_id) {
    throw new PlannerError('CROSS_TENANT', 'Plan belongs to another tenant', {
      plan_id: input.plan_id,
    });
  }

  requirePermission(input.session, 'planner.plan.refresh', existing.group_id);

  if (existing.external_source !== 'm365') {
    throw new PlannerError('PLAN_NOT_LINKED', 'Plan is not linked to M365', {
      plan_id: input.plan_id,
    });
  }

  await deps.enqueuePlanPull({
    tenant_id: existing.tenant_id,
    plan_id: existing.id,
    full: false,
  });
}
