import type { SessionScope } from '@seta/core';
import { and, eq, isNull } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import { plans, tasks } from '../../db/schema.ts';
import type { TaskWithAssigneesRow } from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';
import { taskRowToDto } from './_task-dto.ts';
import { fetchSupplementaryData } from './list-tasks.ts';

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
    ...taskRowToDto(row),
    assignees: assigneesByTaskId.get(row.id) ?? [],
    labels: labelsByTaskId.get(row.id) ?? [],
    checklist_summary: summaryByTaskId.get(row.id) ?? { total: 0, checked: 0 },
  };
}
