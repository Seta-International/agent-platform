import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { checklistItems, plans, tasks } from '../../db/schema.ts';
import { emitPlannerChecklistItemAdded } from '../../events/emit-helpers.ts';
import type { ChecklistItemRow } from '../dto.ts';
import type { AddChecklistItemInput } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { hintBetween, type PlanExternalSource } from './order-hint.ts';

type ChecklistItemDbRow = typeof checklistItems.$inferSelect;

export async function addChecklistItem(
  input: AddChecklistItemInput & { session: SessionScope },
): Promise<ChecklistItemRow> {
  let inserted!: ChecklistItemDbRow;

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

      const existingItems = await tx
        .select()
        .from(checklistItems)
        .where(eq(checklistItems.task_id, input.task_id))
        .orderBy(sql`order_hint NULLS LAST`);

      const planSource = plan.external_source as PlanExternalSource;
      let orderHint: string;
      if (input.after_item_id !== undefined) {
        const afterItem = existingItems.find((i) => i.id === input.after_item_id);
        if (!afterItem) {
          throw new PlannerError('VALIDATION', 'after_item_id not found in this task', {
            after_item_id: input.after_item_id,
            task_id: input.task_id,
          });
        }
        const afterIndex = existingItems.indexOf(afterItem);
        const nextItem = existingItems[afterIndex + 1];
        orderHint = hintBetween(afterItem.order_hint, nextItem?.order_hint ?? null, planSource);
      } else {
        const last = existingItems[existingItems.length - 1];
        orderHint = hintBetween(last?.order_hint ?? null, null, planSource);
      }

      const [row] = await tx
        .insert(checklistItems)
        .values({
          task_id: input.task_id,
          label: input.label,
          order_hint: orderHint,
        })
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Insert returned no row');
      inserted = row;

      await emitPlannerChecklistItemAdded({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: task.tenant_id,
        group_id: plan.group_id,
        item_id: row.id,
        task_id: input.task_id,
        plan_id: task.plan_id,
        label: row.label,
        order_hint: row.order_hint,
      });
    },
  );

  return rowToDto(inserted);
}

function rowToDto(row: ChecklistItemDbRow): ChecklistItemRow {
  return {
    id: row.id,
    task_id: row.task_id,
    label: row.label,
    checked: row.checked,
    order_hint: row.order_hint,
    external_id: row.external_id,
    external_etag: row.external_etag,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
