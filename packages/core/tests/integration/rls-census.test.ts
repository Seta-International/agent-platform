import { assertRlsCensus } from '@seta/shared-testing';
import { describe, it } from 'vitest';
import * as coreSchema from '../../src/db/schema/index.ts';
import { withCoreTestDb } from '../helpers.ts';

const CORE_RLS_ALLOWLIST = [
  // The tenant registry itself — rows describe tenants, they aren't owned by one; pre-tenant.
  'tenants',
  // Outbox: the dispatcher drains all tenants' events in one worker loop and sets the tenant
  // GUC per-event at dispatch time, not for the whole scan — a forced tenant policy would hide
  // every other tenant's events from that scan.
  'events',
  // Email worker drains pending sends across all tenants in one loop (same cross-tenant-drain
  // shape as `events`); has a tenant_id column for dedupe/indexing only, not RLS scoping.
  'outgoing_emails',
  // Subscription dispatcher bookkeeping, keyed by `subscription` name — no tenant_id column;
  // cursors/processed-ids/dead-letters/failure-state span every tenant's events by design.
  'subscription_cursors',
  'subscription_processed',
  'subscription_dead_letter',
  'subscription_failure_state',
  // Idempotency cache keyed by caller-supplied `idempotency_key` across modules/methods — no
  // tenant_id column; the RPC caller may run outside a tenant-scoped session (e.g. worker/cron).
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
