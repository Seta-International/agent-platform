import { closePools, initPools } from '@seta/shared-db';
import { assertRlsCensus, withTestDb } from '@seta/shared-testing';
import { describe, it } from 'vitest';
import { resetNotificationsDb } from '../../src/backend/db/client.ts';
import * as notificationsSchema from '../../src/backend/db/schema/index.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('notifications RLS census', () => {
  it('every tenant-scoped notifications table is RLS-forced and tenant-blind to strangers', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetNotificationsDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`CREATE ROLE seta_app NOSUPERUSER NOBYPASSRLS`).catch(() => {});
        await pool.query(`GRANT USAGE ON SCHEMA notifications TO seta_app`);
        await pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA notifications TO seta_app`);
        await assertRlsCensus(pool, {
          schema: 'notifications',
          tables: notificationsSchema,
          allowlist: [],
        });
      } finally {
        await closePools();
      }
    });
  });
});
