import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { plans, tasks } from '../../db/schema.ts';
import { emitPlannerTaskSyncStatusChanged } from '../../events/emit-helpers.ts';
import type { PlanSyncStatus } from '../../events/types.ts';
import type { MarkTaskSyncStatusInput } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { isM365SystemActor, type PlannerSessionScope } from './_actor.ts';

export async function markTaskSyncStatus(
  input: MarkTaskSyncStatusInput & { session: PlannerSessionScope },
): Promise<void> {
  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [task] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, input.task_id), isNull(tasks.deleted_at)))
        .limit(1);
      if (!task) throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: input.task_id });
      if (task.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Task belongs to another tenant', {
          task_id: input.task_id,
        });
      }

      const [plan] = await tx.select().from(plans).where(eq(plans.id, task.plan_id)).limit(1);
      if (!plan)
        throw new PlannerError('NOT_FOUND', 'Parent plan not found', { plan_id: task.plan_id });

      requirePermission(input.session, 'planner.task.sync.mark-status', plan.group_id);

      if (!isM365SystemActor(input.session)) {
        throw new PlannerError(
          'RESERVED_FOR_SYSTEM_ACTOR',
          'markTaskSyncStatus is callable only by the M365 system actor',
          { task_id: input.task_id },
        );
      }

      const beforeStatus = (task.sync_status ?? 'idle') as PlanSyncStatus;
      const beforeError = task.last_error ?? null;
      const desiredError = input.error ?? null;
      if (beforeStatus === input.status && beforeError === desiredError) {
        return;
      }

      await tx
        .update(tasks)
        .set({
          sync_status: input.status,
          last_error: desiredError,
          updated_at: new Date(),
        })
        .where(eq(tasks.id, input.task_id));

      await emitPlannerTaskSyncStatusChanged({
        actor: { type: 'sync', user_id: null, system_id: 'integrations.m365' },
        tenant_id: task.tenant_id,
        group_id: plan.group_id,
        plan_id: task.plan_id,
        task_id: task.id,
        before_status: beforeStatus,
        after_status: input.status,
        error: desiredError,
      });
    },
  );
}
