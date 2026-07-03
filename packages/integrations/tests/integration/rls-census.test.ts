import { closePools, initPools } from '@seta/shared-db';
import { assertRlsCensus, withTestDb } from '@seta/shared-testing';
import { describe, it } from 'vitest';
import { resetIntegrationsDb } from '../../src/backend/db/client.ts';
import * as integrationsSchema from '../../src/backend/db/schema/index.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('integrations RLS census', () => {
  it('every tenant-scoped integrations table is RLS-forced and tenant-blind to strangers', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetIntegrationsDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`CREATE ROLE seta_app NOSUPERUSER NOBYPASSRLS`).catch(() => {});
        await pool.query(`GRANT USAGE ON SCHEMA integrations TO seta_app`);
        await pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA integrations TO seta_app`);
        await assertRlsCensus(pool, {
          schema: 'integrations',
          tables: integrationsSchema,
          allowlist: [],
        });
      } finally {
        await closePools();
      }
    });
  });
});
