import { closePools, initPools, maintenance, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { candidate } from '../../src/backend/db/schema.ts';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

const env = {
  template: () => process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  base: () => process.env.PLATFORM_TEST_PG_BASE as string,
};

/** The seta_app-role variant of a pooled test database's admin databaseUrl. */
function appRoleUrl(databaseUrl: string): string {
  return databaseUrl.replace(/\/\/[^@]+@/, '//seta_app:seta_app@');
}

async function seedCandidate(pool: import('pg').Pool, tenantId: string, id: string) {
  await pool.query(`INSERT INTO hiring.candidate (id, tenant_id, name) VALUES ($1, $2, $3)`, [
    id,
    tenantId,
    'Test Candidate',
  ]);
}

describe('hiring runtime privilege: hiringDb() resolves through the executor', () => {
  it('scoped(tenantA) sees only tenant A rows through hiringDb(); maintenance() sees both', async () => {
    await withTestDb(
      { templateDbName: env.template(), baseUrl: env.base() },
      async ({ pool, databaseUrl }) => {
        resetHiringDb();
        const candidateA = '33333333-3333-3333-3333-333333333333';
        const candidateB = '44444444-4444-4444-4444-444444444444';
        await seedCandidate(pool, TENANT_A, candidateA);
        await seedCandidate(pool, TENANT_B, candidateB);

        // seta_app is cluster-scoped and outlives the per-run database on a reused
        // container, with grants on other still-live test databases depending on it —
        // DROP ROLE fails there. Create-if-missing then re-assert attributes instead.
        await pool.query(`
          DO $do$
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seta_app') THEN
              CREATE ROLE seta_app LOGIN PASSWORD 'seta_app' NOSUPERUSER NOBYPASSRLS;
            END IF;
          END
          $do$;
        `);
        await pool.query(`ALTER ROLE seta_app LOGIN PASSWORD 'seta_app' NOSUPERUSER NOBYPASSRLS`);
        await pool.query(`GRANT USAGE ON SCHEMA hiring TO seta_app`);
        await pool.query(`GRANT SELECT ON hiring.candidate TO seta_app`);

        const appUrl = appRoleUrl(databaseUrl);
        initPools({ databaseUrl, appDatabaseUrl: appUrl });
        try {
          // No explicit WHERE tenant_id here — this is the whole point: a query that
          // filters by tenant would prove the application code is correct, not that
          // RLS is doing the isolating.
          const scopedRows = await scoped(TENANT_A, async () =>
            hiringDb().select({ id: candidate.id }).from(candidate),
          );
          expect(scopedRows.map((r) => r.id)).toEqual([candidateA]);

          // Proves the cache-keying fix in client.ts: executorPool() returns a
          // *different* Pool under maintenance() than under scoped() (admin pool vs
          // app pool), so hiringDb()'s cache must be keyed on Pool identity — not
          // just "have we built one yet" — or this read would silently run back
          // through the scoped(tenantA) app-pool connection and still see one row.
          const adminRows = await maintenance(async () =>
            hiringDb().select({ id: candidate.id }).from(candidate),
          );
          expect(adminRows.map((r) => r.id).sort()).toEqual([candidateA, candidateB].sort());
        } finally {
          resetHiringDb();
          await closePools();
        }
      },
    );
  });
});
