import type { EmbeddingProvider } from '@seta/shared-embeddings';
import type { RetrievalHit } from '@seta/shared-retrieval';
import { EmbedQueryCache } from '@seta/shared-retrieval';
import type { Pool } from 'pg';

export interface SearchTenantKnowledgeInput {
  query: string;
  tenant_id: string;
  limit: number;
}

export interface SearchTenantKnowledgeDeps {
  provider: EmbeddingProvider;
  pool: Pool;
  embedQueryCache?: EmbedQueryCache;
}

export interface KnowledgeHit {
  file_id: string;
  filename: string;
  page_hint: string | null;
  chunk_ordinal: number;
  chunk_text: string;
}

const HNSW_EF_SEARCH = Number(process.env.HNSW_EF_SEARCH ?? 100);
const defaultCache = new EmbedQueryCache({ maxEntries: 100, ttlMs: 5 * 60_000 });

export async function searchTenantKnowledge(
  input: SearchTenantKnowledgeInput,
  deps: SearchTenantKnowledgeDeps,
): Promise<RetrievalHit<KnowledgeHit>[]> {
  const cache = deps.embedQueryCache ?? defaultCache;
  const qVec = await cache.get(deps.provider.modelId, input.query, async () => {
    const [v] = await deps.provider.embed([input.query]);
    return v as number[];
  });

  const client = await deps.pool.connect();
  try {
    await client.query('BEGIN');
    try {
      // SET LOCAL is transaction-scoped; the BEGIN above is required for the value
      // to apply and not leak to the pool.
      await client.query(`SET LOCAL hnsw.ef_search = ${HNSW_EF_SEARCH}`);

      const rows = await client.query<{
        file_id: string;
        filename: string;
        page_hint: string | null;
        chunk_ordinal: number;
        chunk_text: string;
      }>(
        `SELECT e.file_id, f.filename, c.page_hint, e.chunk_ordinal, c.chunk_text
           FROM copilot.tenant_knowledge_embeddings e
           JOIN copilot.tenant_knowledge_chunks c
             ON c.tenant_id = e.tenant_id AND c.file_id = e.file_id AND c.chunk_ordinal = e.chunk_ordinal
           JOIN copilot.tenant_knowledge_files f
             ON f.id = e.file_id AND f.tenant_id = e.tenant_id
          WHERE e.tenant_id = $1
            AND f.status = 'ready'
          ORDER BY e.embedding <=> $2::halfvec
          LIMIT $3`,
        [input.tenant_id, `[${qVec.join(',')}]`, input.limit],
      );

      await client.query('COMMIT');

      return rows.rows.map((r, i) => ({
        item: {
          file_id: String(r.file_id),
          filename: r.filename,
          page_hint: r.page_hint,
          chunk_ordinal: r.chunk_ordinal,
          chunk_text: r.chunk_text,
        },
        score: 1 / (1 + i),
        rank: i + 1,
        source: 'vector',
      }));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    client.release();
  }
}
