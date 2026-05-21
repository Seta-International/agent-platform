import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { EmbedQueryCache, type RetrievalHit } from '@seta/shared-retrieval';
import type { Pool } from 'pg';
import { FtsRetriever, type TaskRetrievalItem } from './fts.ts';
import { HybridRetriever } from './hybrid.ts';

export interface SearchTasksInput {
  query: string;
  tenant_id: string;
  limit: number;
  group_ids?: bigint[];
}

export interface SearchTasksDeps {
  provider: EmbeddingProvider;
  pool: Pool;
  embedQueryCache?: EmbedQueryCache;
}

const defaultCache = new EmbedQueryCache({ maxEntries: 100, ttlMs: 5 * 60_000 });

export async function searchTasks(
  input: SearchTasksInput,
  deps: SearchTasksDeps,
): Promise<RetrievalHit<TaskRetrievalItem>[]> {
  const cache = deps.embedQueryCache ?? defaultCache;
  const tenant_id = input.tenant_id;
  const actor = { userId: 'system', tenantId: tenant_id };
  const ctx = { tenant_id, actor };

  let queryVector: number[];
  try {
    queryVector = await cache.get(deps.provider.modelId, input.query, async () => {
      const [vec] = await deps.provider.embed([input.query]);
      return vec as number[];
    });
  } catch {
    // Degraded path: FTS-only
    const fts = new FtsRetriever({ pool: deps.pool });
    return fts.query(
      {
        query: input.query,
        tenant_id,
        limit: input.limit,
        group_ids: input.group_ids,
      },
      ctx,
    );
  }

  const hybrid = new HybridRetriever({ pool: deps.pool });
  return hybrid.query(
    {
      query: input.query,
      queryVector,
      tenant_id,
      limit: input.limit,
      group_ids: input.group_ids,
    },
    ctx,
  );
}
