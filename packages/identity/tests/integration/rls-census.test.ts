import { closePools, initPools } from '@seta/shared-db';
import { assertRlsCensus, withTestDb } from '@seta/shared-testing';
import { describe, it } from 'vitest';
import { resetIdentityDb } from '../../src/backend/db/index.ts';
import * as identitySchema from '../../src/backend/db/schema.ts';

// `identity.user` is intentionally RLS-EXEMPT: better-auth reads it via the seta_app web pool
// at login with no tenant GUC set. It has a tenant_id column, so allowlist it here or the census
// would (wrongly) require it to be RLS-forced. Other exempt auth tables lack tenant_id → auto-skipped.
const IDENTITY_RLS_ALLOWLIST = ['user'] as const;

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('identity RLS census', () => {
  it('every tenant-scoped identity table is RLS-forced and tenant-blind to strangers', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`CREATE ROLE seta_app NOSUPERUSER NOBYPASSRLS`).catch(() => {});
        await pool.query(`GRANT USAGE ON SCHEMA identity TO seta_app`);
        await pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA identity TO seta_app`);
        await assertRlsCensus(pool, {
          schema: 'identity',
          tables: identitySchema,
          allowlist: IDENTITY_RLS_ALLOWLIST,
        });
      } finally {
        await closePools();
      }
    });
  });
});
