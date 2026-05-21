import type { RetrievalCtx, RetrievalHit, Retriever } from '@seta/shared-retrieval';
import type { Pool } from 'pg';
import type { TaskRetrievalItem } from './fts.ts';

const HNSW_EF_SEARCH = Number(process.env.HNSW_EF_SEARCH ?? 100);

export interface VectorQuery {
  tenant_id: string;
  queryVector: number[];
  limit: number;
  group_ids?: bigint[];
}

interface TaskRow {
  task_id: string;
  title: string;
}

export class VectorRetriever implements Retriever<VectorQuery, TaskRetrievalItem> {
  private readonly opts: { pool: Pool };

  constructor(opts: { pool: Pool }) {
    this.opts = opts;
  }

  async query(input: VectorQuery, _ctx: RetrievalCtx): Promise<RetrievalHit<TaskRetrievalItem>[]> {
    const { pool } = this.opts;
    const { tenant_id, queryVector, limit, group_ids } = input;

    const overscan = Math.max(limit * 4, 50);
    const vectorLiteral = `[${queryVector.join(',')}]`;

    let sql: string;
    let params: unknown[];

    if (group_ids && group_ids.length > 0) {
      sql = `
        WITH ranked AS (
          SELECT te.task_id,
                 ROW_NUMBER() OVER (ORDER BY te.embedding <=> $2::halfvec) AS per_chunk_rank
            FROM planner.task_embeddings te
           WHERE te.tenant_id = $1
           ORDER BY te.embedding <=> $2::halfvec
           LIMIT $4
        ),
        dedup AS (
          SELECT task_id, MIN(per_chunk_rank) AS rank
            FROM ranked
           GROUP BY task_id
           ORDER BY rank
           LIMIT $3
        )
        SELECT d.task_id, t.title
          FROM dedup d
          JOIN planner.tasks t ON t.id = d.task_id
         WHERE t.tenant_id = $1
           AND t.deleted_at IS NULL
           AND t.plan_id IN (
             SELECT id FROM planner.plans
              WHERE tenant_id = $1
                AND group_id = ANY($5::bigint[])
                AND deleted_at IS NULL
           )
         ORDER BY d.rank
      `;
      params = [tenant_id, vectorLiteral, limit, overscan, group_ids];
    } else {
      sql = `
        WITH ranked AS (
          SELECT te.task_id,
                 ROW_NUMBER() OVER (ORDER BY te.embedding <=> $2::halfvec) AS per_chunk_rank
            FROM planner.task_embeddings te
           WHERE te.tenant_id = $1
           ORDER BY te.embedding <=> $2::halfvec
           LIMIT $4
        ),
        dedup AS (
          SELECT task_id, MIN(per_chunk_rank) AS rank
            FROM ranked
           GROUP BY task_id
           ORDER BY rank
           LIMIT $3
        )
        SELECT d.task_id, t.title
          FROM dedup d
          JOIN planner.tasks t ON t.id = d.task_id
         WHERE t.tenant_id = $1
           AND t.deleted_at IS NULL
         ORDER BY d.rank
      `;
      params = [tenant_id, vectorLiteral, limit, overscan];
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      try {
        // SET LOCAL is transaction-scoped; the BEGIN above is required for the value to apply and not leak to the pool.
        await client.query(`SET LOCAL hnsw.ef_search = ${HNSW_EF_SEARCH}`);
        const result = await client.query<TaskRow>(sql, params);
        await client.query('COMMIT');
        return result.rows.map((row, i) => ({
          item: { task_id: row.task_id, title: row.title },
          score: 1 / (1 + i),
          rank: i + 1,
          source: 'vector' as const,
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
