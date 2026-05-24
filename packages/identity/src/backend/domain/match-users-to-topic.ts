// rbac: system-only — called from staffing's recommender pipeline, not from request handlers.
// Tenant scoping is enforced by the caller (tenantId on the query).
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { EmbedQueryCache, type RetrievalHit } from '@seta/shared-retrieval';
import type { Pool } from 'pg';

const HNSW_EF_SEARCH = Number(process.env.HNSW_EF_SEARCH ?? 100);

export interface UserMatch {
  user_id: string;
  display_name: string;
  email: string;
  skills: string[];
}

export interface MatchUsersToTopicInput {
  topic: string;
  tenant_id: string;
  limit: number;
  minScore?: number;
}

export interface MatchUsersToTopicDeps {
  provider: EmbeddingProvider;
  pool: Pool;
  embedQueryCache?: EmbedQueryCache;
}

const defaultCache = new EmbedQueryCache({ maxEntries: 100, ttlMs: 5 * 60_000 });

/**
 * Vector kNN retriever: finds users whose declared-skill embeddings are
 * closest to the given topic. Returns ranked hits ordered by proximity.
 */
export async function matchUsersToTopic(
  input: MatchUsersToTopicInput,
  deps: MatchUsersToTopicDeps,
): Promise<RetrievalHit<UserMatch>[]> {
  const cache = deps.embedQueryCache ?? defaultCache;

  const queryVector = await cache.get(deps.provider.modelId, input.topic, async () => {
    const [vec] = await deps.provider.embed([input.topic]);
    return vec as number[];
  });

  const { tenant_id, limit } = input;
  const rawMinScore = input.minScore ?? 0.5;
  // 0 means "no threshold": use -1 so the WHERE condition never filters (halfvec sim >= -1).
  const minScore = rawMinScore <= 0 ? -1 : rawMinScore;
  const vectorLiteral = `[${queryVector.join(',')}]`;

  const sql = `
    SELECT u.id AS user_id,
           u.name AS display_name,
           u.email,
           COALESCE(p.skills, ARRAY[]::text[]) AS skills,
           1 - (e.embedding <=> $2::halfvec) AS score
      FROM identity.user_profile_embeddings e
      JOIN identity."user" u ON u.id = e.user_id
      JOIN identity.user_profile p ON p.user_id = e.user_id
     WHERE e.tenant_id = $1
       AND (1 - (e.embedding <=> $2::halfvec)) >= $3
     ORDER BY e.embedding <=> $2::halfvec
     LIMIT $4
  `;

  interface UserRow {
    user_id: string;
    display_name: string;
    email: string;
    skills: string[];
    score: string;
  }

  const client = await deps.pool.connect();
  try {
    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL hnsw.ef_search = ${HNSW_EF_SEARCH}`);
      const result = await client.query<UserRow>(sql, [tenant_id, vectorLiteral, minScore, limit]);
      await client.query('COMMIT');

      return result.rows.map((r, i) => ({
        item: {
          user_id: r.user_id,
          display_name: r.display_name,
          email: r.email,
          skills: r.skills,
        },
        score: Number(r.score),
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
