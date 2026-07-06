import { and, eq, isNull } from 'drizzle-orm';
import { plannerDb } from '../../../db/index.ts';
import { labels, plans, taskLabels, tasks } from '../../../db/schema.ts';
import { priorityToNumber } from '../../../db/task-enums.ts';
import { PlannerError } from '../../../rbac.ts';

export interface LoadedTask {
  taskId: string;
  tenantId: string;
  planId: string;
  /** Owning group of the task's plan — scopes assignment candidates to members. */
  groupId: string;
  title: string;
  description: string;
  labels: string[];
  due_at: Date | null;
  priority_number: number;
}

export async function loadTask(input: { tenantId: string; taskId: string }): Promise<LoadedTask> {
  const db = plannerDb();
  const [row] = await db
    .select({ task: tasks, group_id: plans.group_id })
    .from(tasks)
    .innerJoin(plans, eq(plans.id, tasks.plan_id))
    .where(
      and(
        eq(tasks.tenant_id, input.tenantId),
        eq(tasks.id, input.taskId),
        isNull(tasks.deleted_at),
      ),
    )
    .limit(1);
  if (!row) {
    throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: input.taskId });
  }

  const task = row.task;
  const labelRows = await db
    .select({ name: labels.name })
    .from(taskLabels)
    .innerJoin(labels, eq(labels.id, taskLabels.label_id))
    .where(and(eq(taskLabels.task_id, task.id), isNull(labels.deleted_at)));

  return {
    taskId: task.id,
    tenantId: task.tenant_id,
    planId: task.plan_id,
    groupId: row.group_id,
    title: task.title,
    description: task.description ?? '',
    labels: labelRows.map((l) => l.name),
    due_at: task.due_at,
    priority_number: priorityToNumber(task.priority),
  };
}
