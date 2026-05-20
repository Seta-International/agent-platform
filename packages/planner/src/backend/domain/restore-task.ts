import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { eq } from 'drizzle-orm';
import { plans, tasks } from '../../db/schema.ts';
import { emitPlannerTaskRestored } from '../../events/emit-helpers.ts';
import type { TaskRow } from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

type TaskDbRow = typeof tasks.$inferSelect;

export async function restoreTask(input: {
  task_id: string;
  session: SessionScope;
}): Promise<TaskRow> {
  let restored!: TaskDbRow;
  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [existing] = await tx.select().from(tasks).where(eq(tasks.id, input.task_id)).limit(1);
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

      requirePermission(input.session, 'planner.task.update', plan.group_id);

      if (existing.deleted_at === null) {
        throw new PlannerError('VALIDATION', 'Task is not deleted');
      }

      const [row] = await tx
        .update(tasks)
        .set({ deleted_at: null, updated_at: new Date(), version: existing.version + 1 })
        .where(eq(tasks.id, input.task_id))
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Restore returned no row');
      restored = row;

      await emitPlannerTaskRestored({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        task_id: existing.id,
        plan_id: existing.plan_id,
        group_id: plan.group_id,
        version_after: existing.version + 1,
      });
    },
  );

  return rowToDto(restored);
}

function rowToDto(row: TaskDbRow): TaskRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    plan_id: row.plan_id,
    bucket_id: row.bucket_id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    progress: row.progress,
    review_state: row.review_state,
    skill_tags: row.skill_tags,
    due_at: row.due_at ? row.due_at.toISOString() : null,
    sort_order: row.sort_order,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
    version: row.version,
  };
}
