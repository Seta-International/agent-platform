import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { plans } from '../../db/schema.ts';
import { emitPlannerPlanSyncStatusChanged } from '../../events/emit-helpers.ts';
import type { PlanSyncStatus } from '../../events/types.ts';
import type { MarkPlanSyncStatusInput } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { isM365SystemActor, type PlannerSessionScope } from './_actor.ts';

export async function markPlanSyncStatus(
  input: MarkPlanSyncStatusInput & { session: PlannerSessionScope },
): Promise<void> {
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

      requirePermission(input.session, 'planner.plan.sync.mark-status', existing.group_id);

      if (!isM365SystemActor(input.session)) {
        throw new PlannerError(
          'RESERVED_FOR_SYSTEM_ACTOR',
          'markPlanSyncStatus is callable only by the M365 system actor',
          { plan_id: input.plan_id },
        );
      }

      const beforeStatus = (existing.sync_status ?? 'idle') as PlanSyncStatus;
      const beforeError = existing.last_error ?? null;
      const desiredError = input.error ?? null;
      if (beforeStatus === input.status && beforeError === desiredError) {
        return;
      }

      await tx
        .update(plans)
        .set({
          sync_status: input.status,
          last_error: desiredError,
          updated_at: new Date(),
        })
        .where(eq(plans.id, input.plan_id));

      await emitPlannerPlanSyncStatusChanged({
        actor: { type: 'sync', user_id: null, system_id: 'integrations.m365' },
        tenant_id: existing.tenant_id,
        group_id: existing.group_id,
        plan_id: existing.id,
        before_status: beforeStatus,
        after_status: input.status,
        error: desiredError,
      });
    },
  );
}
