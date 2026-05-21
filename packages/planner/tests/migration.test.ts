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
