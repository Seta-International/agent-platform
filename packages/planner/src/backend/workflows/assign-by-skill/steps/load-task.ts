import { and, eq, isNull } from 'drizzle-orm';
import { plannerDb } from '../../../db/index.ts';
import { labels, taskLabels, tasks } from '../../../db/schema.ts';
import { PlannerError } from '../../../rbac.ts';

export interface LoadedTask {
  taskId: string;
  tenantId: string;
  planId: string;
  title: string;
  description: string;
  skill_tags: string[];
  labels: string[];
  due_at: Date | null;
  priority_number: number;
}

export async function loadTask(input: { tenantId: string; taskId: string }): Promise<LoadedTask> {
  const db = plannerDb();
  const [row] = await db
    .select()
    .from(tasks)
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

  const labelRows = await db
    .select({ name: labels.name })
    .from(taskLabels)
    .innerJoin(labels, eq(labels.id, taskLabels.label_id))
    .where(and(eq(taskLabels.task_id, row.id), isNull(labels.deleted_at)));

  return {
    taskId: row.id,
    tenantId: row.tenant_id,
    planId: row.plan_id,
    title: row.title,
    description: row.description ?? '',
    skill_tags: row.skill_tags ?? [],
    labels: labelRows.map((l) => l.name),
    due_at: row.due_at,
    priority_number: row.priority_number,
  };
}
