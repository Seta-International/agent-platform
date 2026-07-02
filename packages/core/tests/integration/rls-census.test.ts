import { assertRlsCensus } from '@seta/shared-testing';
import { describe, it } from 'vitest';
import * as coreSchema from '../../src/db/schema/index.ts';
import { withCoreTestDb } from '../helpers.ts';

const CORE_RLS_ALLOWLIST = [
  'tenants',
  'events',
  'outgoing_emails',
  'subscription_cursors',
  'subscription_processed',
  'subscription_dead_letter',
  'subscription_failure_state',
  'rpc_idempotency',
] as const;

describe('core RLS census', () => {
  it('every tenant-scoped core table is RLS-forced and tenant-blind to strangers', async () => {
    await withCoreTestDb(async ({ pool }) => {
      await pool.query(`CREATE ROLE seta_app NOSUPERUSER NOBYPASSRLS`).catch(() => {});
      await pool.query(`GRANT USAGE ON SCHEMA core TO seta_app`);
      await pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA core TO seta_app`);
      await assertRlsCensus(pool, {
        schema: 'core',
        tables: coreSchema,
        allowlist: CORE_RLS_ALLOWLIST,
      });
    });
  });
});
