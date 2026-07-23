// packages/planner/tests/fixtures/golden/vector-search.ts
//
// The real pgvector `RetrievalSearch` for the A3 retrieval lane. Reuses the
// production `findSimilarTasks` domain (Mastra `PgVector.query` cosine NN with a
// tenant metadata filter) so the eval exercises the exact code path the agent
// uses — no hand-written SQL. Returns ranked task ids for `runRetrievalCases`.

import { resolveEmbeddingProvider } from '@seta/shared-embeddings';
import { findSimilarTasks } from '../../../src/backend/domain/find-similar-tasks.ts';
import { getPlannerVectorStore } from '../../../src/backend/embeddings/vector-store.ts';
import type { RetrievalSearch } from './retrieval-runner.ts';

/**
 * Builds a `RetrievalSearch` bound to the seeded DB. `completionStatus: 'any'`
 * so graded-relevance labels aren't silently dropped when a labeled task is
 * already completed (the default 'open' filter would hide them).
 */
export function makeGoldenVectorSearch(databaseUrl: string): RetrievalSearch {
  const provider = resolveEmbeddingProvider();
  const pgVector = getPlannerVectorStore(databaseUrl);
  return async (query, tenantId) => {
    const { results } = await findSimilarTasks(
      { tenant_id: tenantId, text: query, completionStatus: 'any', limit: 10 },
      { provider, pgVector },
    );
    return results.map((r) => r.taskId);
  };
}
