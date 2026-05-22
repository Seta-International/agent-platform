import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { EmbedQueryCache, type RetrievalHit } from '@seta/shared-retrieval';
import type { Pool } from 'pg';

const HNSW_EF_SEARCH = Number(process.env.HNSW_EF_SEARCH ?? 100);

export interface UserMatch {
  user_id: string;
  name: string;
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

  const [queryVector] = await Promise.all([
    cache.get(deps.provider.modelId, input.topic, async () => {
      const [vec] = await deps.provider.embed([input.topic]);
      return vec as number[];
    }),
  ]);

  const { tenant_id, limit } = input;
  const overscan = Math.max(limit * 4, 50);
  const vectorLiteral = `[${queryVector.join(',')}]`;

  const sql = `
    WITH ranked AS (
      SELECT upe.user_id,
             ROW_NUMBER() OVER (ORDER BY upe.embedding <=> $2::halfvec) AS rank
        FROM identity.user_profile_embeddings upe
       WHERE upe.tenant_id = $1
       ORDER BY upe.embedding <=> $2::halfvec
       LIMIT $4
    )
    SELECT r.rank,
           u.id       AS user_id,
           u.name,
           u.email,
           COALESCE(up.skills, ARRAY[]::text[]) AS skills
      FROM ranked r
      JOIN identity."user" u ON u.id = r.user_id
      LEFT JOIN identity.user_profile up ON up.user_id = r.user_id
     WHERE u.tenant_id = $1
       AND u.deactivated_at IS NULL
     ORDER BY r.rank
     LIMIT $3
  `;

  interface UserRow {
    rank: string;
    user_id: string;
    name: string;
    email: string;
    skills: string[];
  }

  const client = await deps.pool.connect();
  try {
    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL hnsw.ef_search = ${HNSW_EF_SEARCH}`);
      const result = await client.query<UserRow>(sql, [tenant_id, vectorLiteral, limit, overscan]);
      await client.query('COMMIT');

      const hits: RetrievalHit<UserMatch>[] = [];
      let outRank = 0;
      for (const row of result.rows) {
        outRank += 1;
        const score = 1 / (1 + outRank);
        if (input.minScore !== undefined && score < input.minScore) continue;
        hits.push({
          item: {
            user_id: row.user_id,
            name: row.name,
            email: row.email,
            skills: row.skills,
          },
          score,
          rank: outRank,
          source: 'vector',
        });
      }
      return hits;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    client.release();
  }
}
