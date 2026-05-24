import { and, eq, isNull } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { tasks } from '../db/schema.ts';

export interface GetTaskForEmbeddingInput {
  tenant_id: string;
  task_id: string;
}

export interface TaskForEmbedding {
  title: string;
  description: string | null;
  skill_tags: string[];
  plan_id: string;
}

/**
 * Thin task read for the embedding pipeline. Returns only the columns
 * buildTaskSource() consumes. Skips soft-deleted rows (a soft-deleted task
 * should have its embedding removed by the subscriber — see embed-task.ts).
 *
 * No RBAC check — this is a system-actor read called by the embedding worker.
 */
export async function getTaskForEmbedding(
  input: GetTaskForEmbeddingInput,
): Promise<TaskForEmbedding | null> {
  const db = plannerDb();

  const [row] = await db
    .select({
      title: tasks.title,
      description: tasks.description,
      skill_tags: tasks.skill_tags,
      plan_id: tasks.plan_id,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.tenant_id, input.tenant_id),
        eq(tasks.id, input.task_id),
        isNull(tasks.deleted_at),
      ),
    )
    .limit(1);

  if (!row) return null;
  return row;
}
