import type { PgVector } from '@mastra/pg';
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

/** Stage-1 oversampling — fetch this many hits from PgVector before rerank. */
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
  /** Which reranker actually scored these — surfaces precision tier to callers. */
  reranker: 'cohere' | 'llm-judge' | 'noop' | 'fallback';
}

const defaultCache = new EmbedQueryCache({ maxEntries: 100, ttlMs: 5 * 60_000 });

/**
 * Stage-1 vector search via Mastra's PgVector + stage-2 rerank.
 *
 * Returns oversample × topN candidates from cosine similarity (score in [0,1]
 * = 1 − cosine_distance), then runs them through the project's Reranker for
 * precision lift. If the query embedding fails, returns { hits: [] } —
 * callers that previously expected FTS fallback are now responsible for any
 * graceful-degradation messaging at the UI layer.
 */
export async function searchTasks(
  input: SearchTasksInput,
  deps: SearchTasksDeps,
): Promise<SearchTasksResult> {
  const { provider, pgVector, reranker } = deps;
  const cache = deps.embedQueryCache ?? defaultCache;

  await ensurePlannerVectorIndex(pgVector);

  let queryVector: number[];
  try {
    queryVector = await cache.get(provider.modelId, input.query, async () => {
      const [vec] = await provider.embed([input.query]);
      return vec as number[];
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
      // chunk_text always begins with "Title: …" (see buildTaskSource). We
      // only need a display string; the agent-tool surface fills in `snippet`
      // from `item.title`, so we expose the first line as the title.
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
