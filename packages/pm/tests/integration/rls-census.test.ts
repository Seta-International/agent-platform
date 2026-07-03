import { closePools, initPools } from '@seta/shared-db';
import { assertRlsCensus, withTestDb } from '@seta/shared-testing';
import { describe, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import * as pmSchema from '../../src/backend/db/schema.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('pm RLS census', () => {
  it('every tenant-scoped pm table is RLS-forced and tenant-blind to strangers', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetPmDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`CREATE ROLE seta_app NOSUPERUSER NOBYPASSRLS`).catch(() => {});
        await pool.query(`GRANT USAGE ON SCHEMA pm TO seta_app`);
        await pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA pm TO seta_app`);
        await assertRlsCensus(pool, {
          schema: 'pm',
          tables: pmSchema,
          allowlist: [],
        });
      } finally {
        await closePools();
      }
    });
  });
});
