import type { SessionScope } from '@seta/core';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import { checklistItems, plans, taskReferences, tasks } from '../../db/schema.ts';
import type {
  ChecklistItemRow,
  TaskDetailRow,
  TaskReferenceRow,
  TaskReferenceType,
} from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';
import { taskRowToDto } from './_task-dto.ts';
import { fetchAssigneesAndLabels } from './list-tasks.ts';

export async function getTask(input: {
  task_id: string;
  session: SessionScope;
}): Promise<TaskDetailRow> {
  requirePermission(input.session, 'planner.task.read');

  const db = plannerDb();

  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, input.task_id), isNull(tasks.deleted_at)))
    .limit(1);

  if (!row) {
    throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: input.task_id });
  }

  if (row.tenant_id !== input.session.tenant_id) {
    throw new PlannerError('CROSS_TENANT', 'Task belongs to another tenant', {
      task_id: input.task_id,
    });
  }

  const [plan] = await db.select().from(plans).where(eq(plans.id, row.plan_id)).limit(1);
  if (!plan) {
    throw new PlannerError('NOT_FOUND', 'Parent plan not found', { plan_id: row.plan_id });
  }

  requirePermission(input.session, 'planner.task.read', plan.group_id);

  const groupFilter = groupFilterFor(input.session);
  if (groupFilter !== null && !groupFilter.includes(plan.group_id)) {
    throw new PlannerError('FORBIDDEN', 'No access to group', {
      task_id: input.task_id,
      group_id: plan.group_id,
    });
  }

  const [{ assigneesByTaskId, labelsByTaskId }, checklistRows, referenceRows] = await Promise.all([
    fetchAssigneesAndLabels(db, [row.id]),
    db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.task_id, row.id))
      .orderBy(sql`order_hint NULLS LAST`),
    db
      .select()
      .from(taskReferences)
      .where(eq(taskReferences.task_id, row.id))
      .orderBy(sql`preview_priority NULLS LAST`, asc(taskReferences.created_at)),
  ]);

  const checklist: ChecklistItemRow[] = checklistRows.map((r) => ({
    id: r.id,
    task_id: r.task_id,
    label: r.label,
    checked: r.checked,
    order_hint: r.order_hint,
    external_id: r.external_id,
    external_etag: r.external_etag,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  }));

  const checklist_summary = {
    total: checklist.length,
    checked: checklist.filter((c) => c.checked).length,
  };

  const references: TaskReferenceRow[] = referenceRows.map((r) => ({
    id: r.id,
    tenant_id: r.tenant_id,
    task_id: r.task_id,
    url: r.url,
    alias: r.alias,
    type: r.type as TaskReferenceType,
    preview_priority: r.preview_priority,
    external_etag: r.external_etag,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  }));

  return {
    ...taskRowToDto(row),
    assignees: assigneesByTaskId.get(row.id) ?? [],
    labels: labelsByTaskId.get(row.id) ?? [],
    checklist_summary,
    checklist,
    references,
  };
}
