import type { TaskDraft } from './schemas.ts';
import { classifyByThreshold } from './steps/classify-by-threshold.ts';
import { normalizeDraft } from './steps/normalize-draft.ts';
import { type SearchSimilarDeps, searchSimilar } from './steps/search-similar.ts';

export interface BatchDedupItem {
  draftTitle: string;
  classification: 'likely-dup' | 'maybe-dup' | 'no-match';
  topCandidateId?: string;
  topScore?: number;
}

export interface BatchDedupInput {
  tenantId: string;
  drafts: ReadonlyArray<TaskDraft | unknown>;
  thresholds: { likelyDup: number; maybeDup: number };
}

export type BatchDedupDeps = SearchSimilarDeps;

/**
 * Log-only batch dedup for bulk import paths (CSV / MS Planner sync).
 *
 * Never blocks. Returns a per-row classification + the top candidate so
 * importers can emit a metric or surface a downstream review queue. There is
 * no HITL — `dedupOnCreate` HITL is interactive-only.
 */
export async function dedupBatch(
  input: BatchDedupInput,
  deps: BatchDedupDeps,
): Promise<BatchDedupItem[]> {
  const results: BatchDedupItem[] = [];
  for (const raw of input.drafts) {
    const draft = normalizeDraft(raw);
    const queryText = `${draft.title}\n\n${draft.description}`.trim();
    const { candidates } = await searchSimilar({ tenantId: input.tenantId, queryText }, deps);
    const { classification, top } = classifyByThreshold({ candidates }, input.thresholds);
    results.push({
      draftTitle: draft.title,
      classification,
      topCandidateId: top[0]?.taskId,
      topScore: top[0]?.score,
    });
  }
  return results;
}
