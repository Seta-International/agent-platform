import { closePools, initPools } from '@seta/shared-db';
import { assertRlsCensus, withTestDb } from '@seta/shared-testing';
import { describe, it } from 'vitest';
import { resetAgentDb } from '../../src/backend/db/index.ts';
import * as agentSchema from '../../src/backend/db/schema.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

// Mastra's own runtime tables (mastra_threads, mastra_messages, mastra_resources,
// mastra_workflow_snapshot, mastra_ai_spans, mastra_traces) have no tenant_id and
// are guarded application-side by TenantGuardedMastraStore's resourceId contract,
// not by RLS — they're app-layer-scoped, not tenant-scoped. They're also not
// drizzle exports (Mastra's PostgresStore creates them lazily at runtime, not via
// our migrations), so assertRlsCensus never sees them via agentSchema regardless;
// the allowlist is a harmless belt-and-suspenders in case that ever changes.
const MASTRA_RUNTIME_TABLES = [
  'mastra_threads',
  'mastra_messages',
  'mastra_resources',
  'mastra_workflow_snapshot',
  'mastra_ai_spans',
  'mastra_traces',
];

describe('agent RLS census', () => {
  it('every tenant-scoped agent table is RLS-forced and tenant-blind to strangers', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetAgentDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`CREATE ROLE seta_app NOSUPERUSER NOBYPASSRLS`).catch(() => {});
        await pool.query(`GRANT USAGE ON SCHEMA agent TO seta_app`);
        await pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA agent TO seta_app`);
        await assertRlsCensus(pool, {
          schema: 'agent',
          tables: agentSchema,
          allowlist: MASTRA_RUNTIME_TABLES,
        });
      } finally {
        await closePools();
      }
    });
  });
});
