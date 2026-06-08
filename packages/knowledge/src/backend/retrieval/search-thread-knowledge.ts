import type { PgVector } from '@mastra/pg';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import type { RetrievalHit } from '@seta/shared-retrieval';
import { EmbedQueryCache } from '@seta/shared-retrieval';
import type { Pool } from 'pg';
import {
  ensureKnowledgeVectorIndex,
  KNOWLEDGE_VECTOR_INDEX,
  type KnowledgeChunkVectorMetadata,
} from '../embeddings/vector-store.ts';
import type { KnowledgeHit } from './search-tenant-knowledge.ts';

export interface SearchThreadKnowledgeInput {
  query: string;
  tenant_id: string;
  thread_id: string;
  limit: number;
}

export interface SearchThreadKnowledgeDeps {
  provider: EmbeddingProvider;
  pgVector: PgVector;
  pool: Pool;
  embedQueryCache?: EmbedQueryCache;
}

const defaultCache = new EmbedQueryCache({ maxEntries: 100, ttlMs: 5 * 60_000 });

/** Retrieve chunks from the documents attached to ONE chat thread. Scopes both
 *  the ready-file gate and the pgvector filter to (tenant_id, thread_id) so a
 *  thread only ever sees its own uploads. */
export async function searchThreadKnowledge(
  input: SearchThreadKnowledgeInput,
  deps: SearchThreadKnowledgeDeps,
): Promise<RetrievalHit<KnowledgeHit>[]> {
  const cache = deps.embedQueryCache ?? defaultCache;
  await ensureKnowledgeVectorIndex(deps.pgVector);

  const qVec = await cache.get(deps.provider.modelId, input.query, async () => {
    const [v] = await deps.provider.embed([input.query]);
    return v as number[];
  });

  const readyFiles = await deps.pool.query<{ id: string }>(
    `SELECT id FROM knowledge.files
      WHERE tenant_id = $1 AND thread_id = $2 AND status = 'ready'`,
    [input.tenant_id, input.thread_id],
  );
  const readyFileIds = new Set(readyFiles.rows.map((r) => String(r.id)));
  if (readyFileIds.size === 0) return [];

  const rows = await deps.pgVector.query({
    indexName: KNOWLEDGE_VECTOR_INDEX,
    queryVector: qVec,
    topK: input.limit,
    filter: { tenant_id: { $eq: input.tenant_id }, thread_id: { $eq: input.thread_id } },
  });

  const hits: RetrievalHit<KnowledgeHit>[] = [];
  for (const row of rows) {
    const md = row.metadata as Partial<KnowledgeChunkVectorMetadata> | undefined;
    if (!md?.file_id || md.chunk_ordinal == null) continue;
    if (!readyFileIds.has(md.file_id)) continue;
    hits.push({
      item: {
        file_id: md.file_id,
        filename: md.filename ?? '',
        page_hint: md.page_hint ?? null,
        chunk_ordinal: md.chunk_ordinal,
        chunk_text: md.chunk_text ?? '',
      },
      score: row.score,
      rank: hits.length + 1,
      source: 'vector',
    });
  }
  return hits;
}
