import { closePools, initPools } from '@seta/shared-db';
import { assertRlsCensus, withTestDb } from '@seta/shared-testing';
import { describe, it } from 'vitest';
import { resetPeopleDb } from '../../src/backend/db/client.ts';
import * as peopleSchema from '../../src/backend/db/schema.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('people RLS census', () => {
  it('every tenant-scoped people table is RLS-forced and tenant-blind to strangers', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`CREATE ROLE seta_app NOSUPERUSER NOBYPASSRLS`).catch(() => {});
        await pool.query(`GRANT USAGE ON SCHEMA people TO seta_app`);
        await pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA people TO seta_app`);
        await assertRlsCensus(pool, {
          schema: 'people',
          tables: peopleSchema,
          allowlist: [],
        });
      } finally {
        await closePools();
      }
    });
  });
});
