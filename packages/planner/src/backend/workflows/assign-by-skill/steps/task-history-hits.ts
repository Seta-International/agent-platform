import type { PgVector } from '@mastra/pg';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import type { Reranker } from '@seta/shared-retrieval';
import { and, eq, inArray } from 'drizzle-orm';
import { plannerDb } from '../../../db/index.ts';
import { taskAssignments, tasks } from '../../../db/schema.ts';
import { searchTasks } from '../../../retrieval/search-tasks.ts';
import type { LoadedTask } from './load-task.ts';

export interface TaskHistoryHit {
  userId: string;
  /** Best similarity score across the user's matched past tasks, in [0,1]. */
  historyScore: number;
  /** How many similar past tasks the user has been assigned to. */
  matches: number;
}

export interface TaskHistoryDeps {
  provider: EmbeddingProvider;
  pgVector: PgVector;
  reranker: Reranker;
}

const SIMILAR_TASK_LIMIT = 8;

/**
 * "Who has done similar work before?" — vector-search prior tasks in the
 * tenant, restrict to completed/in-progress tasks, then aggregate assignees.
 *
 * Acts as a skill-proxy when users haven't filled in their skills profile.
 * Score per user = max similarity over their matched past tasks (in [0,1]);
 * matches count is surfaced to the HITL card for context.
 */
export async function fetchTaskHistoryHits(
  input: { tenantId: string; task: LoadedTask },
  deps: TaskHistoryDeps,
): Promise<TaskHistoryHit[]> {
  const parts = [input.task.title, input.task.description, input.task.labels.join(', ')]
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const queryText = parts.join('\n\n');
  if (!queryText) return [];

  let result: Awaited<ReturnType<typeof searchTasks>>;
  try {
    result = await searchTasks(
      { query: queryText, tenant_id: input.tenantId, limit: SIMILAR_TASK_LIMIT },
      deps,
    );
  } catch {
    return [];
  }

  const taskIdToScore = new Map<string, number>();
  for (const hit of result.hits) {
    if (hit.item.task_id === input.task.taskId) continue; // exclude self
    const existing = taskIdToScore.get(hit.item.task_id);
    if (existing === undefined || hit.rerankScore > existing) {
      taskIdToScore.set(hit.item.task_id, normalizeScore(hit.rerankScore));
    }
  }
  if (taskIdToScore.size === 0) return [];

  const rows = await plannerDb()
    .select({
      task_id: taskAssignments.task_id,
      user_id: taskAssignments.user_id,
    })
    .from(taskAssignments)
    .innerJoin(tasks, eq(tasks.id, taskAssignments.task_id))
    .where(
      and(
        inArray(taskAssignments.task_id, Array.from(taskIdToScore.keys())),
        eq(tasks.tenant_id, input.tenantId),
      ),
    );

  const byUser = new Map<string, TaskHistoryHit>();
  for (const row of rows) {
    const score = taskIdToScore.get(row.task_id) ?? 0;
    const existing = byUser.get(row.user_id);
    if (!existing) {
      byUser.set(row.user_id, { userId: row.user_id, historyScore: score, matches: 1 });
    } else {
      existing.matches += 1;
      if (score > existing.historyScore) existing.historyScore = score;
    }
  }
  return Array.from(byUser.values());
}

// Reranker scores can be cosine-similarity (-1..1) or cohere-style (0..1).
// Clamp to [0,1] so downstream weighting is well-defined.
function normalizeScore(s: number): number {
  if (s <= 0) return 0;
  if (s >= 1) return 1;
  return s;
}
