import { closePools, initPools, maintenance, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { knowledgeDb, resetKnowledgeDb } from '../../src/backend/db/client.ts';
import { files } from '../../src/backend/db/schema.ts';

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

async function seedFile(pool: import('pg').Pool, tenantId: string, filename: string) {
  await pool.query(
    `INSERT INTO knowledge.files
       (tenant_id, uploaded_by, filename, mime_type, size_bytes, s3_key, status)
     VALUES ($1, gen_random_uuid(), $2, 'application/pdf', 1, $3, 'ready')`,
    [tenantId, filename, `tenants/${tenantId}/${filename}`],
  );
}

describe('knowledge runtime privilege: knowledgeDb() resolves through the executor', () => {
  it('scoped(tenantA) sees only tenant A rows through knowledgeDb(); maintenance() sees both', async () => {
    await withTestDb(
      { templateDbName: env.template(), baseUrl: env.base() },
      async ({ pool, databaseUrl }) => {
        resetKnowledgeDb();
        await seedFile(pool, TENANT_A, 'a.pdf');
        await seedFile(pool, TENANT_B, 'b.pdf');

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
        await pool.query(`GRANT USAGE ON SCHEMA knowledge TO seta_app`);
        await pool.query(`GRANT SELECT ON knowledge.files TO seta_app`);

        const appUrl = appRoleUrl(databaseUrl);
        initPools({ databaseUrl, appDatabaseUrl: appUrl });
        try {
          // No explicit WHERE tenant_id here — this is the whole point: a query that
          // filters by tenant would prove the application code is correct, not that
          // RLS is doing the isolating.
          const scopedRows = await scoped(TENANT_A, async () =>
            knowledgeDb().select({ filename: files.filename }).from(files),
          );
          expect(scopedRows.map((r) => r.filename)).toEqual(['a.pdf']);

          // Proves the cache-keying fix in client.ts: executorPool() returns a
          // *different* Pool under maintenance() than under scoped() (admin pool vs
          // app pool), so knowledgeDb()'s cache must be keyed on Pool identity — not
          // just "have we built one yet" — or this read would silently run back
          // through the scoped(tenantA) app-pool connection and still see one row.
          const adminRows = await maintenance(async () =>
            knowledgeDb().select({ filename: files.filename }).from(files),
          );
          expect(adminRows.map((r) => r.filename).sort()).toEqual(['a.pdf', 'b.pdf']);
        } finally {
          resetKnowledgeDb();
          await closePools();
        }
      },
    );
  });
});
