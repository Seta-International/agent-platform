import type { SessionScope } from '@seta/core';
import { requestNotification } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { plans, taskAssignments, tasks } from '../../db/schema.ts';
import { emitPlannerTaskAssigned } from '../../events/emit-helpers.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

export async function assignTask(input: {
  task_id: string;
  user_id: string;
  session: SessionScope;
}): Promise<void> {
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
        .from(tasks)
        .where(and(eq(tasks.id, input.task_id), isNull(tasks.deleted_at)))
        .limit(1);
      if (!existing)
        throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: input.task_id });
      if (existing.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Task belongs to another tenant', {
          task_id: input.task_id,
        });
      }

      const [plan] = await tx.select().from(plans).where(eq(plans.id, existing.plan_id)).limit(1);
      if (!plan)
        throw new PlannerError('NOT_FOUND', 'Parent plan not found', {
          plan_id: existing.plan_id,
        });

      requirePermission(input.session, 'planner.task.assign', plan.group_id);

      // ON CONFLICT DO NOTHING: idempotent — if already assigned, skip.
      const inserted = await tx
        .insert(taskAssignments)
        .values({
          task_id: input.task_id,
          user_id: input.user_id,
          assigned_by: input.session.user_id,
        })
        .onConflictDoNothing()
        .returning();

      if (inserted.length === 0) {
        // Already assigned — no-op, no event.
        return;
      }

      const { eventId } = await emitPlannerTaskAssigned({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        task_id: existing.id,
        plan_id: existing.plan_id,
        group_id: plan.group_id,
        user_id: input.user_id,
      });

      const recipients = [input.user_id].filter((u) => u !== input.session.user_id);
      await requestNotification({
        tenant_id: existing.tenant_id,
        event_type: 'planner.task.assigned',
        user_ids: recipients,
        source_event_id: eventId,
        payload: {
          title: 'Task assigned',
          body: `You were assigned to "${existing.title}"`,
          task_id: existing.id,
          plan_id: existing.plan_id,
          group_id: plan.group_id,
          actor: { user_id: input.session.user_id, name: input.session.user_id },
        },
      });
    },
  );
}
