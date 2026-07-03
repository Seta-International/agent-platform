import { closePools, initPools } from '@seta/shared-db';
import { assertRlsCensus, withTestDb } from '@seta/shared-testing';
import { describe, it } from 'vitest';
import { resetPlannerDb } from '../../src/backend/db/index.ts';
import * as plannerSchema from '../../src/backend/db/schema.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('planner RLS census', () => {
  it('every tenant-scoped planner table is RLS-forced and tenant-blind to strangers', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetPlannerDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`CREATE ROLE seta_app NOSUPERUSER NOBYPASSRLS`).catch(() => {});
        await pool.query(`GRANT USAGE ON SCHEMA planner TO seta_app`);
        await pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA planner TO seta_app`);
        await assertRlsCensus(pool, {
          schema: 'planner',
          tables: plannerSchema,
          allowlist: [],
        });
      } finally {
        await closePools();
      }
    });
  });
});
