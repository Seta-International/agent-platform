import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { labels, plans, taskLabels, tasks } from '../../db/schema.ts';
import { emitPlannerLabelApplied } from '../../events/emit-helpers.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { isM365SystemActor } from './_actor.ts';

export async function applyLabel(input: {
  task_id: string;
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

      requirePermission(input.session, 'planner.task.update', plan.group_id);

      const [label] = await tx
        .select()
        .from(labels)
        .where(and(eq(labels.id, input.label_id), isNull(labels.deleted_at)))
        .limit(1);
      if (!label)
        throw new PlannerError('NOT_FOUND', 'Label not found', { label_id: input.label_id });
      if (label.plan_id !== plan.id) {
        throw new PlannerError('VALIDATION', 'Label belongs to a different plan', {
          label_id: input.label_id,
          label_plan_id: label.plan_id,
          task_plan_id: plan.id,
        });
      }

      if (
        plan.external_source === 'm365' &&
        label.category_slot == null &&
        !isM365SystemActor(input.session)
      ) {
        throw new PlannerError(
          'LABEL_NOT_SYNCABLE',
          'On a linked plan, only labels mapped to a category slot can be applied',
          { label_id: input.label_id, plan_id: plan.id },
        );
      }

      const inserted = await tx
        .insert(taskLabels)
        .values({
          task_id: input.task_id,
          label_id: input.label_id,
          applied_by: input.session.user_id,
        })
        .onConflictDoNothing()
        .returning();

      // No-op if already applied (ON CONFLICT DO NOTHING returned empty).
      if (inserted.length === 0) return;

      await emitPlannerLabelApplied({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: task.tenant_id,
        group_id: plan.group_id,
        task_id: input.task_id,
        plan_id: task.plan_id,
        label_id: input.label_id,
      });
    },
  );
}
