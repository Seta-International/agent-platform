import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { plans } from '../../db/schema.ts';
import { emitPlannerPlanConflictResolved } from '../../events/emit-helpers.ts';
import type { PlannerConflictDecision } from '../../events/types.ts';
import type { ResolvePlanConflictsInput } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

export interface ResolvePlanConflictsDeps {
  enqueuePlanPush: (payload: {
    tenant_id: string;
    plan_id: string;
    decisions: PlannerConflictDecision[];
  }) => Promise<void>;
}

export interface ResolvePlanConflictsResult {
  applied: number;
}

export async function resolvePlanConflicts(
  input: ResolvePlanConflictsInput & { session: SessionScope },
  deps: ResolvePlanConflictsDeps,
): Promise<ResolvePlanConflictsResult> {
  if (input.decisions.length === 0) {
    throw new PlannerError('VALIDATION', 'No decisions provided', { plan_id: input.plan_id });
  }

  let applied = 0;
  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(plans)
        .where(and(eq(plans.id, input.plan_id), isNull(plans.deleted_at)))
        .limit(1);
      if (!existing)
        throw new PlannerError('NOT_FOUND', 'Plan not found', { plan_id: input.plan_id });
      if (existing.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Plan belongs to another tenant', {
          plan_id: input.plan_id,
        });
      }

      requirePermission(input.session, 'planner.plan.resolve-conflict', existing.group_id);

      if (existing.external_source !== 'm365') {
        throw new PlannerError('PLAN_NOT_LINKED', 'Plan is not linked to M365', {
          plan_id: input.plan_id,
        });
      }

      const decisions = input.decisions as PlannerConflictDecision[];
      const localDecisions = decisions.filter((d) => d.choice === 'local');
      if (localDecisions.length > 0) {
        await deps.enqueuePlanPush({
          tenant_id: existing.tenant_id,
          plan_id: existing.id,
          decisions: localDecisions,
        });
      }

      await emitPlannerPlanConflictResolved({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        group_id: existing.group_id,
        plan_id: existing.id,
        decisions,
      });
      applied = decisions.length;
    },
  );

  return { applied };
}
