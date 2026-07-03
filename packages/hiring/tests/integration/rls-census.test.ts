import { closePools, initPools } from '@seta/shared-db';
import { assertRlsCensus, withTestDb } from '@seta/shared-testing';
import { describe, it } from 'vitest';
import { resetHiringDb } from '../../src/backend/db/client.ts';
import * as hiringSchema from '../../src/backend/db/schema.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('hiring RLS census', () => {
  it('every tenant-scoped hiring table is RLS-forced and tenant-blind to strangers', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`CREATE ROLE seta_app NOSUPERUSER NOBYPASSRLS`).catch(() => {});
        await pool.query(`GRANT USAGE ON SCHEMA hiring TO seta_app`);
        await pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA hiring TO seta_app`);
        await assertRlsCensus(pool, {
          schema: 'hiring',
          tables: hiringSchema,
          allowlist: [],
        });
      } finally {
        await closePools();
      }
    });
  });
});
