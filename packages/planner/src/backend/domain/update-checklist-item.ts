import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { eq } from 'drizzle-orm';
import { checklistItems, plans, tasks } from '../../db/schema.ts';
import { emitPlannerChecklistItemUpdated } from '../../events/emit-helpers.ts';
import type { ChecklistItemRow } from '../dto.ts';
import type { UpdateChecklistItemPatch } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

type ChecklistItemDbRow = typeof checklistItems.$inferSelect;

export async function updateChecklistItem(input: {
  item_id: string;
  patch: UpdateChecklistItemPatch;
  session: SessionScope;
}): Promise<ChecklistItemRow> {
  let result!: ChecklistItemDbRow;

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
        .from(checklistItems)
        .where(eq(checklistItems.id, input.item_id))
        .limit(1);
      if (!existing)
        throw new PlannerError('NOT_FOUND', 'Checklist item not found', { item_id: input.item_id });

      const [task] = await tx.select().from(tasks).where(eq(tasks.id, existing.task_id)).limit(1);
      if (!task)
        throw new PlannerError('NOT_FOUND', 'Parent task not found', { task_id: existing.task_id });
      if (task.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Task belongs to another tenant', {
          task_id: existing.task_id,
        });
      }

      const [plan] = await tx.select().from(plans).where(eq(plans.id, task.plan_id)).limit(1);
      if (!plan)
        throw new PlannerError('NOT_FOUND', 'Parent plan not found', { plan_id: task.plan_id });

      requirePermission(input.session, 'planner.task.update', plan.group_id);

      const before: Partial<{ label: string; checked: boolean; order_hint: string | null }> = {};
      const after: Partial<{ label: string; checked: boolean; order_hint: string | null }> = {};
      const setFields: {
        label?: string;
        checked?: boolean;
        order_hint?: string;
        updated_at: Date;
      } = {
        updated_at: new Date(),
      };

      if (input.patch.label !== undefined && input.patch.label !== existing.label) {
        before.label = existing.label;
        after.label = input.patch.label;
        setFields.label = input.patch.label;
      }

      if (input.patch.checked !== undefined && input.patch.checked !== existing.checked) {
        before.checked = existing.checked;
        after.checked = input.patch.checked;
        setFields.checked = input.patch.checked;
      }

      if (input.patch.order_hint !== undefined && input.patch.order_hint !== existing.order_hint) {
        before.order_hint = existing.order_hint;
        after.order_hint = input.patch.order_hint;
        setFields.order_hint = input.patch.order_hint;
      }

      if (Object.keys(after).length === 0) {
        result = existing;
        return;
      }

      const [row] = await tx
        .update(checklistItems)
        .set(setFields)
        .where(eq(checklistItems.id, input.item_id))
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Update returned no row');
      result = row;

      await emitPlannerChecklistItemUpdated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: task.tenant_id,
        group_id: plan.group_id,
        item_id: existing.id,
        task_id: existing.task_id,
        plan_id: task.plan_id,
        before,
        after,
      });
    },
  );

  return rowToDto(result);
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
