import type { SessionScope } from '@seta/core';
import type { Candidate, Classification, DedupInput, DedupOutput, DupAction } from './schemas.ts';
import { classifyByThreshold } from './steps/classify-by-threshold.ts';
import { type SearchSimilarDeps, searchSimilar } from './steps/search-similar.ts';

export interface DupSearchResult {
  classification: Classification;
  candidates: Candidate[];
  task: DedupInput;
}

export interface DedupDeps extends SearchSimilarDeps {
  thresholds: { likelyDup: number; maybeDup: number };
}

/**
 * Phase A — read-only: search for similar tasks to the already-created task,
 * classify the closeness. No DB writes, no HITL.
 */
export async function findDupCandidates(
  input: { task: DedupInput; session: { tenantId: string; userId: string } },
  deps: DedupDeps,
): Promise<DupSearchResult> {
  const queryText = `${input.task.title}\n\n${input.task.description}`.trim();
  const { candidates } = await searchSimilar({ tenantId: input.session.tenantId, queryText }, deps);
  // Filter out the task itself from candidates
  const filtered = candidates.filter((c) => c.taskId !== input.task.taskId);
  const { classification, top } = classifyByThreshold({ candidates: filtered }, deps.thresholds);
  return { classification, candidates: top, task: input.task };
}

/**
 * Phase B — apply the user's decision after HITL resolves.
 * Task already exists; we either link it, delete it, or leave it alone.
 */
export async function applyDupDecision(input: {
  taskId: string;
  action: DupAction;
  session: SessionScope;
}): Promise<DedupOutput> {
  if (input.action.kind === 'leave') {
    return { kind: 'kept', taskId: input.taskId };
  }

  if (input.action.kind === 'delete') {
    const { deleteTask } = await import('../../domain/delete-task.ts');
    const { getTask } = await import('../../domain/get-task.ts');
    const task = await getTask({ task_id: input.taskId, session: input.session });
    await deleteTask({
      task_id: input.taskId,
      expected_version: task.version,
      session: input.session,
    });
    return { kind: 'deleted', taskId: input.taskId };
  }

  // 'link' — add task_references on the new task pointing to selected existing ones
  const { addTaskReference } = await import('../../domain/add-task-reference.ts');
  for (const existingId of input.action.existingIds) {
    await addTaskReference({
      task_id: input.taskId,
      url: `seta://planner/tasks/${existingId}`,
      alias: `Related: existing task ${existingId.slice(0, 8)}`,
      type: 'link',
      session: input.session,
    });
  }
  return { kind: 'linked', taskId: input.taskId, linkedTo: input.action.existingIds };
}
