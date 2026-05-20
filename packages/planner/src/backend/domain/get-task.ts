import type { SessionScope } from '@seta/core';
import { and, eq, isNull } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import { plans, tasks } from '../../db/schema.ts';
import type { TaskWithAssigneesRow } from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';
import { fetchSupplementaryData } from './list-tasks.ts';

type TaskDbRow = typeof tasks.$inferSelect;

function taskRowToBase(
  row: TaskDbRow,
): Omit<TaskWithAssigneesRow, 'assignees' | 'labels' | 'checklist_summary'> {
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

export async function getTask(input: {
  task_id: string;
  session: SessionScope;
}): Promise<TaskWithAssigneesRow> {
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

  const { assigneesByTaskId, labelsByTaskId, summaryByTaskId } = await fetchSupplementaryData(db, [
    row.id,
  ]);

  return {
    ...taskRowToBase(row),
    assignees: assigneesByTaskId.get(row.id) ?? [],
    labels: labelsByTaskId.get(row.id) ?? [],
    checklist_summary: summaryByTaskId.get(row.id) ?? { total: 0, checked: 0 },
  };
}
