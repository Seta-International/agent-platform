import type { SessionScope } from '@seta/core';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import { checklistItems, plans, tasks } from '../../db/schema.ts';
import type { ChecklistItemRow } from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';

type ChecklistItemDbRow = typeof checklistItems.$inferSelect;

export async function listChecklistItems(input: {
  task_id: string;
  session: SessionScope;
}): Promise<ChecklistItemRow[]> {
  const db = plannerDb();

  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, input.task_id), isNull(tasks.deleted_at)))
    .limit(1);

  if (!task) {
    throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: input.task_id });
  }

  if (task.tenant_id !== input.session.tenant_id) {
    throw new PlannerError('CROSS_TENANT', 'Task belongs to another tenant', {
      task_id: input.task_id,
    });
  }

  const [plan] = await db.select().from(plans).where(eq(plans.id, task.plan_id)).limit(1);
  if (!plan) {
    throw new PlannerError('NOT_FOUND', 'Parent plan not found', { plan_id: task.plan_id });
  }

  requirePermission(input.session, 'planner.task.read', plan.group_id);

  const filter = groupFilterFor(input.session);
  if (filter !== null && !filter.includes(plan.group_id)) {
    throw new PlannerError('FORBIDDEN', 'No access to group', { task_id: input.task_id });
  }

  const rows = await db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.task_id, input.task_id))
    .orderBy(asc(checklistItems.sort_order));

  return rows.map(rowToDto);
}

function rowToDto(row: ChecklistItemDbRow): ChecklistItemRow {
  return {
    id: row.id,
    task_id: row.task_id,
    label: row.label,
    checked: row.checked,
    sort_order: row.sort_order,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
