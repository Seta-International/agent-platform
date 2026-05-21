import type { RetrievalCtx, RetrievalHit, Retriever } from '@seta/shared-retrieval';
import type { Pool } from 'pg';

export interface FtsQuery {
  query: string;
  tenant_id: string;
  limit: number;
  group_ids?: bigint[];
}

export interface TaskRetrievalItem {
  task_id: string;
  title: string;
}

interface TaskRow {
  task_id: string;
  title: string;
}

export class FtsRetriever implements Retriever<FtsQuery, TaskRetrievalItem> {
  private readonly opts: { pool: Pool };

  constructor(opts: { pool: Pool }) {
    this.opts = opts;
  }

  async query(input: FtsQuery, _ctx: RetrievalCtx): Promise<RetrievalHit<TaskRetrievalItem>[]> {
    const { pool } = this.opts;
    const { query, tenant_id, limit, group_ids } = input;

    let sql: string;
    let params: unknown[];

    if (group_ids && group_ids.length > 0) {
      sql = `
        SELECT t.id AS task_id, t.title
          FROM planner.tasks t, plainto_tsquery('english', $2) q
         WHERE t.tenant_id = $1
           AND t.deleted_at IS NULL
           AND t.search_tsv @@ q
           AND t.plan_id IN (
             SELECT id FROM planner.plans
              WHERE tenant_id = $1
                AND group_id = ANY($4::bigint[])
                AND deleted_at IS NULL
           )
         ORDER BY ts_rank_cd(t.search_tsv, q) DESC
         LIMIT $3
      `;
      params = [tenant_id, query, limit, group_ids];
    } else {
      sql = `
        SELECT t.id AS task_id, t.title
          FROM planner.tasks t, plainto_tsquery('english', $2) q
         WHERE t.tenant_id = $1
           AND t.deleted_at IS NULL
           AND t.search_tsv @@ q
         ORDER BY ts_rank_cd(t.search_tsv, q) DESC
         LIMIT $3
      `;
      params = [tenant_id, query, limit];
    }

    const result = await pool.query<TaskRow>(sql, params);

    return result.rows.map((row, i) => ({
      item: {
        task_id: row.task_id,
        title: row.title,
      },
      score: 1 / (1 + i),
      rank: i + 1,
      source: 'fts' as const,
    }));
  }
}
