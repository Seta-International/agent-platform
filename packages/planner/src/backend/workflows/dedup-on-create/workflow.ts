import type { SessionScope } from '@seta/core';
import type { Candidate, Classification, DedupOutput, LinkMode, TaskDraft } from './schemas.ts';
import { classifyByThreshold } from './steps/classify-by-threshold.ts';
import { createTaskStep } from './steps/create-task.ts';
import { embedDraft } from './steps/embed-draft.ts';
import { linkToExisting } from './steps/link-to-existing.ts';
import { normalizeDraft } from './steps/normalize-draft.ts';
import { type SearchSimilarDeps, searchSimilar } from './steps/search-similar.ts';

export type DupAction =
  | { kind: 'create-new' }
  | { kind: 'link'; existingId: string; mode: LinkMode }
  | { kind: 'cancel' };

export interface DupSearchResult {
  classification: Classification;
  candidates: Candidate[];
  draft: TaskDraft;
}

export interface DedupDeps extends SearchSimilarDeps {
  thresholds: { likelyDup: number; maybeDup: number };
}

/**
 * Phase A — read-only: normalize the draft, search for similar tasks, and
 * classify the closeness. No DB writes, no HITL. Surfaced to agents as
 * `planner_findDupCandidates`.
 */
export async function findDupCandidates(
  input: { draft: unknown; session: { tenantId: string; userId: string } },
  deps: DedupDeps,
): Promise<DupSearchResult> {
  const draft = normalizeDraft(input.draft);
  // Compute and discard the embed vector — searchTasks re-embeds the query
  // internally (with its own cache). We embed here only so the dedup workflow
  // can be replayed end-to-end with deterministic behavior in tests.
  await embedDraft(draft, deps);
  const queryText = `${draft.title}\n\n${draft.description}`.trim();
  const { candidates } = await searchSimilar({ tenantId: input.session.tenantId, queryText }, deps);
  const { classification, top } = classifyByThreshold({ candidates }, deps.thresholds);
  return { classification, candidates: top, draft };
}

/**
 * Phase B — apply the user's decision. Called by `planner_createTask` after
 * the HITL approval card resolves (or directly when classification ==
 * 'no-match' and no HITL is needed).
 */
export async function applyDupDecision(input: {
  draft: TaskDraft;
  action: DupAction;
  session: SessionScope;
}): Promise<DedupOutput> {
  if (input.action.kind === 'cancel') return { kind: 'cancelled' };

  if (input.action.kind === 'create-new') {
    const { taskId } = await createTaskStep({ draft: input.draft, session: input.session });
    return { kind: 'created', taskId };
  }

  return linkToExisting({
    existingId: input.action.existingId,
    mode: input.action.mode,
    draft: input.draft,
    session: input.session,
  });
}
