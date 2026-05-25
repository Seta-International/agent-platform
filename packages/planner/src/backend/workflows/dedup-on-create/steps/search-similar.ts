import type { PgVector } from '@mastra/pg';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import type { Reranker } from '@seta/shared-retrieval';
import { searchTasks } from '../../../retrieval/search-tasks.ts';
import type { Candidate } from '../schemas.ts';

export interface SearchSimilarInput {
  tenantId: string;
  queryText: string;
  topK?: number;
}

export interface SearchSimilarOutput {
  candidates: Candidate[];
}

export interface SearchSimilarDeps {
  provider: EmbeddingProvider;
  pgVector: PgVector;
  reranker: Reranker;
}

export async function searchSimilar(
  input: SearchSimilarInput,
  deps: SearchSimilarDeps,
): Promise<SearchSimilarOutput> {
  const { hits } = await searchTasks(
    {
      query: input.queryText,
      tenant_id: input.tenantId,
      limit: input.topK ?? 5,
    },
    deps,
  );
  const candidates: Candidate[] = hits.map((h) => ({
    taskId: h.item.task_id,
    title: h.item.title,
    score: h.rerankScore,
    status: 'open',
  }));
  return { candidates };
}
