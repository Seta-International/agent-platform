import type { RetrievalCtx, RetrievalHit, Retriever } from '@seta/shared-retrieval';
import type { Pool } from 'pg';
import type { TaskRetrievalItem } from './fts.ts';

const HNSW_EF_SEARCH = Number(process.env.HNSW_EF_SEARCH ?? 100);

/** RRF stage-1 limit: top-N fetched from each sub-retriever before fusion. §4.1 */
const STAGE1_LIMIT = 50;

export interface HybridQuery {
  query: string;
  queryVector: number[];
  tenant_id: string;
  limit: number;
  group_ids?: bigint[];
  k?: number; // RRF constant, default 60
}

interface HybridRow {
  task_id: string;
  title: string;
  rrf_score: string; // pg returns numeric as string
}

export class HybridRetriever implements Retriever<HybridQuery, TaskRetrievalItem> {
  private readonly opts: { pool: Pool };

  constructor(opts: { pool: Pool }) {
    this.opts = opts;
  }

  async query(input: HybridQuery, _ctx: RetrievalCtx): Promise<RetrievalHit<TaskRetrievalItem>[]> {
    const { pool } = this.opts;
    const { query, queryVector, tenant_id, limit, group_ids, k = 60 } = input;

    const vectorLiteral = `[${queryVector.join(',')}]`;

    let sql: string;
    let params: unknown[];

    if (group_ids && group_ids.length > 0) {
      sql = `
        WITH fts AS (
          SELECT t.id AS task_id,
                 ROW_NUMBER() OVER (ORDER BY ts_rank_cd(t.search_tsv, q) DESC) AS rank
            FROM planner.tasks t, plainto_tsquery('english', $2) q
           WHERE t.tenant_id = $1
             AND t.deleted_at IS NULL
             AND t.search_tsv @@ q
           ORDER BY ts_rank_cd(t.search_tsv, q) DESC
           LIMIT $4
        ),
        vec AS (
          SELECT task_id, MIN(per_chunk_rank) AS rank
            FROM (
              SELECT te.task_id,
                     ROW_NUMBER() OVER (ORDER BY te.embedding <=> $3::halfvec) AS per_chunk_rank
                FROM planner.task_embeddings te
               WHERE te.tenant_id = $1
               ORDER BY te.embedding <=> $3::halfvec
               LIMIT $4 * 4
            ) sub
            GROUP BY task_id
            ORDER BY rank
            LIMIT $4
        )
        SELECT t.id AS task_id,
               t.title,
               (COALESCE(1.0 / ($5 + fts.rank), 0) + COALESCE(1.0 / ($5 + vec.rank), 0)) AS rrf_score
          FROM planner.tasks t
          LEFT JOIN fts ON fts.task_id = t.id
          LEFT JOIN vec ON vec.task_id = t.id
         WHERE t.tenant_id = $1
           AND t.deleted_at IS NULL
           AND (fts.task_id IS NOT NULL OR vec.task_id IS NOT NULL)
           AND t.plan_id IN (
             SELECT id FROM planner.plans
              WHERE tenant_id = $1
                AND group_id = ANY($7::bigint[])
                AND deleted_at IS NULL
           )
         ORDER BY rrf_score DESC
         LIMIT $6
      `;
      params = [tenant_id, query, vectorLiteral, STAGE1_LIMIT, k, limit, group_ids];
    } else {
      sql = `
        WITH fts AS (
          SELECT t.id AS task_id,
                 ROW_NUMBER() OVER (ORDER BY ts_rank_cd(t.search_tsv, q) DESC) AS rank
            FROM planner.tasks t, plainto_tsquery('english', $2) q
           WHERE t.tenant_id = $1
             AND t.deleted_at IS NULL
             AND t.search_tsv @@ q
           ORDER BY ts_rank_cd(t.search_tsv, q) DESC
           LIMIT $4
        ),
        vec AS (
          SELECT task_id, MIN(per_chunk_rank) AS rank
            FROM (
              SELECT te.task_id,
                     ROW_NUMBER() OVER (ORDER BY te.embedding <=> $3::halfvec) AS per_chunk_rank
                FROM planner.task_embeddings te
               WHERE te.tenant_id = $1
               ORDER BY te.embedding <=> $3::halfvec
               LIMIT $4 * 4
            ) sub
            GROUP BY task_id
            ORDER BY rank
            LIMIT $4
        )
        SELECT t.id AS task_id,
               t.title,
               (COALESCE(1.0 / ($5 + fts.rank), 0) + COALESCE(1.0 / ($5 + vec.rank), 0)) AS rrf_score
          FROM planner.tasks t
          LEFT JOIN fts ON fts.task_id = t.id
          LEFT JOIN vec ON vec.task_id = t.id
         WHERE t.tenant_id = $1
           AND t.deleted_at IS NULL
           AND (fts.task_id IS NOT NULL OR vec.task_id IS NOT NULL)
         ORDER BY rrf_score DESC
         LIMIT $6
      `;
      params = [tenant_id, query, vectorLiteral, STAGE1_LIMIT, k, limit];
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      try {
        // SET LOCAL is transaction-scoped; BEGIN is required for the value to apply and not leak to the pool.
        await client.query(`SET LOCAL hnsw.ef_search = ${HNSW_EF_SEARCH}`);
        const rows = await client.query<HybridRow>(sql, params);
        await client.query('COMMIT');
        return rows.rows.map((row, i) => ({
          item: { task_id: row.task_id, title: row.title },
          score: Number(row.rrf_score),
          rank: i + 1,
          source: 'hybrid' as const,
        }));
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    } finally {
      client.release();
    }
  }
}
