import type { PgVector } from '@mastra/pg';
import { BudgetExceededError, checkBudget } from '@seta/core';
import { emitUsageObserved } from '@seta/core/events';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import {
  EmbedQueryCache,
  type RerankedHit,
  type Reranker,
  type RetrievalHit,
} from '@seta/shared-retrieval';
import {
  ensurePlannerVectorIndex,
  PLANNER_VECTOR_INDEX,
  type TaskVectorMetadata,
} from '../embeddings/vector-store.ts';

const STAGE1_TOPK = Number(process.env.RERANK_STAGE1_TOPK ?? 50);

export interface TaskRetrievalItem {
  task_id: string;
  title: string;
}

export interface SearchTasksInput {
  query: string;
  tenant_id: string;
  limit: number;
}

export interface SearchTasksDeps {
  provider: EmbeddingProvider;
  pgVector: PgVector;
  reranker: Reranker;
  embedQueryCache?: EmbedQueryCache;
}

export interface SearchTasksResult {
  hits: RerankedHit<TaskRetrievalItem>[];
  reranker: 'cohere' | 'llm-judge' | 'noop' | 'fallback';
}

const defaultCache = new EmbedQueryCache({ maxEntries: 100, ttlMs: 5 * 60_000 });

export async function searchTasks(
  input: SearchTasksInput,
  deps: SearchTasksDeps,
): Promise<SearchTasksResult> {
  const { provider, pgVector, reranker } = deps;
  const cache = deps.embedQueryCache ?? defaultCache;

  await ensurePlannerVectorIndex(pgVector);

  // Coarse budget gate before the (cache-missing) embed. Placed outside the
  // try below so it propagates to the route's 402 mapper rather than being
  // swallowed into the empty-result fallback.
  const budget = await checkBudget(input.tenant_id);
  if (budget.blocked) throw new BudgetExceededError(budget.reason ?? 'month');

  let queryVector: number[];
  try {
    queryVector = await cache.get(provider.modelId, input.query, async () => {
      // Only a cache miss reaches the model, so usage is emitted exactly when a
      // real embedding call is billed. Pricing keys use "provider/model"; the
      // provider id is "provider:model".
      const { vectors, tokens } = await provider.embedWithUsage([input.query]);
      const modelKey = provider.modelId.replace(':', '/');
      await emitUsageObserved({
        tenantId: input.tenant_id,
        feature: 'embedding',
        provider: modelKey.split('/')[0] ?? 'unknown',
        modelKey,
        tokensIn: tokens,
        tokensOut: 0,
        causedByUserId: null,
      });
      return vectors[0] as number[];
    });
  } catch {
    return { hits: [], reranker: 'fallback' };
  }

  const stage1Limit = Math.max(input.limit * 3, STAGE1_TOPK);

  const queryResults = await pgVector.query({
    indexName: PLANNER_VECTOR_INDEX,
    queryVector,
    topK: stage1Limit,
    filter: { tenant_id: { $eq: input.tenant_id } },
  });

  const stage1: RetrievalHit<TaskRetrievalItem>[] = queryResults
    .map((row, i) => {
      const md = row.metadata as Partial<TaskVectorMetadata> | undefined;
      if (!md?.task_id) return null;
      const title =
        (md.chunk_text ?? '')
          .split('\n', 1)[0]
          ?.replace(/^Title:\s*/, '')
          .trim() ?? '';
      return {
        item: { task_id: md.task_id, title } satisfies TaskRetrievalItem,
        score: row.score,
        rank: i + 1,
        source: 'vector' as const,
      };
    })
    .filter((h): h is RetrievalHit<TaskRetrievalItem> => h !== null);

  if (stage1.length === 0) return { hits: [], reranker: 'noop' };

  const reranked = await reranker.rescore(input.query, stage1, { topN: input.limit });
  const usedReranker = reranked[0]?.reranker ?? 'noop';

  return { hits: reranked, reranker: usedReranker };
}
