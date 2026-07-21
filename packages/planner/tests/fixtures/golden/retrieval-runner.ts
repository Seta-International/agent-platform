// packages/planner/tests/fixtures/golden/retrieval-runner.ts
//
// Drives the retrieval (A3) cases. Pure orchestration: receives the ranked
// result from an INJECTED `search` so it unit-tests with a fake and, in the E2E
// lane, is wired to the real pgvector search over seeded embeddings. Never
// touches a DB or a model itself.
import { type RetrievalScore, scoreRetrieval } from './ir-metrics.ts';
import { evaluateRetrievalPolicy, type RetrievalPolicyResult } from './retrieval-policy.ts';
import type { GoldenCase } from './schema.ts';

export type RetrievalSearch = (query: string, tenantId: string) => Promise<string[]>;

export interface RetrievalCaseResult {
  id: string;
  rankedIds: string[];
  score: RetrievalScore;
  policy: RetrievalPolicyResult;
}

export interface RunRetrievalCasesParams {
  cases: GoldenCase[];
  search: RetrievalSearch;
  decoyIds: string[];
}

export async function runRetrievalCases(
  params: RunRetrievalCasesParams,
): Promise<RetrievalCaseResult[]> {
  const results: RetrievalCaseResult[] = [];
  for (const c of params.cases) {
    if (c.kind !== 'retrieval') continue;
    const rankedIds = await params.search(c.query, c.tenantId);
    const score = scoreRetrieval(rankedIds, c.relevance, c.evaluation.k);
    const policy = evaluateRetrievalPolicy({
      rankedIds,
      score,
      relevance: c.relevance,
      decoyIds: params.decoyIds,
    });
    results.push({ id: c.id, rankedIds, score, policy });
  }
  return results;
}
