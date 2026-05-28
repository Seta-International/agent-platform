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
  console.log('[dedup.findDupCandidates] step 1/4 — normalize draft');
  const draft = normalizeDraft(input.draft);
  console.log('[dedup.findDupCandidates] step 2/4 — embed draft', { title: draft.title });
  // Compute and discard the embed vector — searchTasks re-embeds the query
  // internally (with its own cache). We embed here only so the dedup workflow
  // can be replayed end-to-end with deterministic behavior in tests.
  await embedDraft(draft, deps);
  console.log('[dedup.findDupCandidates] step 3/4 — search similar tasks (vector + rerank)');
  const queryText = `${draft.title}\n\n${draft.description}`.trim();
  const { candidates } = await searchSimilar({ tenantId: input.session.tenantId, queryText }, deps);
  console.log('[dedup.findDupCandidates] step 4/4 — classify by threshold', {
    candidatesFound: candidates.length,
    thresholds: deps.thresholds,
  });
  const { classification, top } = classifyByThreshold({ candidates }, deps.thresholds);
  console.log('[dedup.findDupCandidates] ✓ done', {
    classification,
    topCount: top.length,
    bestScore: top[0]?.score ?? null,
    bestTitle: top[0]?.title?.slice(0, 50) ?? null,
  });
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
  console.log('[dedup.applyDupDecision] ← action received', {
    kind: input.action.kind,
    title: input.draft.title,
    ...(input.action.kind === 'link'
      ? { existingId: input.action.existingId, mode: input.action.mode }
      : {}),
  });

  if (input.action.kind === 'cancel') {
    console.log('[dedup.applyDupDecision] → cancelled (user chose to leave it)');
    return { kind: 'cancelled' };
  }

  if (input.action.kind === 'create-new') {
    console.log('[dedup.applyDupDecision] → creating new task (no duplicates / user chose leave)');
    const { taskId } = await createTaskStep({ draft: input.draft, session: input.session });
    console.log('[dedup.applyDupDecision] ✓ task created', { taskId });
    return { kind: 'created', taskId };
  }

  console.log('[dedup.applyDupDecision] → linking to existing task', {
    existingId: input.action.existingId,
    mode: input.action.mode,
  });
  const result = await linkToExisting({
    existingId: input.action.existingId,
    mode: input.action.mode,
    draft: input.draft,
    session: input.session,
  });
  console.log('[dedup.applyDupDecision] ✓ link complete', result);
  return result;
}
