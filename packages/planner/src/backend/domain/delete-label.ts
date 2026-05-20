import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { labels, plans, taskLabels } from '../../db/schema.ts';
import { emitPlannerLabelDeleted } from '../../events/emit-helpers.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

export async function deleteLabel(input: {
  label_id: string;
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
        .from(labels)
        .where(and(eq(labels.id, input.label_id), isNull(labels.deleted_at)))
        .limit(1);
      if (!existing)
        throw new PlannerError('NOT_FOUND', 'Label not found', { label_id: input.label_id });
      if (existing.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Label belongs to another tenant', {
          label_id: input.label_id,
        });
      }

      const [plan] = await tx.select().from(plans).where(eq(plans.id, existing.plan_id)).limit(1);
      if (!plan)
        throw new PlannerError('NOT_FOUND', 'Parent plan not found', { plan_id: existing.plan_id });

      requirePermission(input.session, 'planner.plan.update', plan.group_id);

      await tx.update(labels).set({ deleted_at: new Date() }).where(eq(labels.id, input.label_id));

      // Physically remove all task_label rows referencing this label.
      // Consumers infer applied labels are gone from the planner.label.deleted event.
      await tx.delete(taskLabels).where(eq(taskLabels.label_id, input.label_id));

      await emitPlannerLabelDeleted({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        group_id: plan.group_id,
        label_id: existing.id,
        plan_id: existing.plan_id,
      });
    },
  );
}
