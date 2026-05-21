import { createContributionRegistry, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { registerPlannerContributions } from '../src/register.ts';

describe('planner migrations', () => {
  it('creates planner.task_embeddings as a partitioned parent with the expected columns', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool }) => {
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        registerPlannerContributions(reg);
        await runMigrations(reg, { pool });

        const cols = await pool.query<{ column_name: string }>(`
          SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'planner' AND table_name = 'task_embeddings'
           ORDER BY ordinal_position
        `);
        expect(cols.rows.map((r) => r.column_name)).toEqual([
          'tenant_id',
          'task_id',
          'chunk_ordinal',
          'chunk_text',
          'source_hash',
          'embedding',
          'model_id',
          'embedded_at',
        ]);

        const part = await pool.query<{ partstrat: string }>(`
          SELECT partstrat::text FROM pg_partitioned_table
           WHERE partrelid = 'planner.task_embeddings'::regclass
        `);
        expect(part.rows[0]?.partstrat).toBe('l');
      },
    );
  });
});

describe('0006_tasks_search_tsv_and_task_id_fix', () => {
  it('planner.tasks has a search_tsv generated column using to_tsvector', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool }) => {
        const res = await pool.query<{ generation_expression: string }>(`
          SELECT generation_expression
          FROM information_schema.columns
          WHERE table_schema = 'planner'
            AND table_name = 'tasks'
            AND column_name = 'search_tsv'
        `);
        expect(res.rows).toHaveLength(1);
        expect(res.rows[0]?.generation_expression).toContain('to_tsvector');
      },
    );
  });

  it('GIN index tasks_search_tsv_gin_idx exists on planner.tasks(search_tsv)', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool }) => {
        const res = await pool.query<{ indexname: string; indexdef: string }>(`
          SELECT indexname, indexdef
          FROM pg_indexes
          WHERE schemaname = 'planner'
            AND tablename = 'tasks'
            AND indexname = 'tasks_search_tsv_gin_idx'
        `);
        expect(res.rows).toHaveLength(1);
        expect(res.rows[0]?.indexdef?.toUpperCase()).toContain('USING GIN');
      },
    );
  });

  it('search_tsv matches plainto_tsquery after task insert', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool }) => {
        const tenantId = '11111111-1111-1111-1111-111111111111';
        const planId = '22222222-2222-2222-2222-222222222222';
        const groupId = '33333333-3333-3333-3333-333333333333';
        const userId = '44444444-4444-4444-4444-444444444444';
        const taskId = '55555555-5555-5555-5555-555555555555';

        // Minimal prerequisite rows (no FK enforcement on these UUIDs in test)
        await pool.query(
          `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'FTS Test Org', 'fts-test') ON CONFLICT DO NOTHING`,
          [tenantId],
        );
        await pool.query(
          `INSERT INTO planner.groups (id, tenant_id, name, created_by) VALUES ($1, $2, 'FTS Group', $3) ON CONFLICT DO NOTHING`,
          [groupId, tenantId, userId],
        );
        await pool.query(
          `INSERT INTO planner.plans (id, tenant_id, group_id, name, created_by) VALUES ($1, $2, $3, 'FTS Plan', $4) ON CONFLICT DO NOTHING`,
          [planId, tenantId, groupId, userId],
        );
        await pool.query(
          `INSERT INTO planner.tasks (id, tenant_id, plan_id, title, description, created_by)
           VALUES ($1, $2, $3, 'kubernetes deployment', 'rollout review', $4)
           ON CONFLICT DO NOTHING`,
          [taskId, tenantId, planId, userId],
        );

        const res = await pool.query<{ matched: boolean }>(
          `
          SELECT search_tsv @@ plainto_tsquery('english', 'kubernetes rollout') AS matched
          FROM planner.tasks
          WHERE id = $1
        `,
          [taskId],
        );

        expect(res.rows).toHaveLength(1);
        expect(res.rows[0]?.matched).toBe(true);
      },
    );
  });

  it('planner.task_embeddings.task_id column type is uuid', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool }) => {
        const res = await pool.query<{ data_type: string }>(`
          SELECT data_type
          FROM information_schema.columns
          WHERE table_schema = 'planner'
            AND table_name = 'task_embeddings'
            AND column_name = 'task_id'
        `);
        expect(res.rows).toHaveLength(1);
        expect(res.rows[0]?.data_type).toBe('uuid');
      },
    );
  });
});
