import { closePools, initPools, maintenance, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { slugifySkill } from '../../src/backend/skills/canonicalize.ts';
import { coreDb, resetCoreDb } from '../../src/db/client.ts';
import { coreSkill } from '../../src/db/schema/skills.ts';

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

async function seedSkill(pool: import('pg').Pool, tenantId: string, name: string) {
  const [category] = (
    await pool.query<{ id: string }>(
      `INSERT INTO core.skill_category (tenant_id, name) VALUES ($1, $2) RETURNING id`,
      [tenantId, `${name}-category`],
    )
  ).rows;
  await pool.query(
    `INSERT INTO core.skill (tenant_id, category_id, name, slug) VALUES ($1, $2, $3, $4)`,
    [tenantId, category.id, name, slugifySkill(name)],
  );
}

describe('core runtime privilege: coreDb() resolves through the executor', () => {
  it('scoped(tenantA) sees only tenant A rows through coreDb(); maintenance() sees both', async () => {
    await withTestDb(
      { templateDbName: env.template(), baseUrl: env.base() },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        await seedSkill(pool, TENANT_A, 'skill-a');
        await seedSkill(pool, TENANT_B, 'skill-b');

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
        await pool.query(`GRANT USAGE ON SCHEMA core TO seta_app`);
        await pool.query(`GRANT SELECT ON core.skill TO seta_app`);

        const appUrl = appRoleUrl(databaseUrl);
        initPools({ databaseUrl, appDatabaseUrl: appUrl });
        try {
          // No explicit WHERE tenant_id here — this is the whole point: a query that
          // filters by tenant would prove the application code is correct, not that
          // RLS is doing the isolating.
          const scopedRows = await scoped(TENANT_A, async () =>
            coreDb().select({ name: coreSkill.name }).from(coreSkill),
          );
          expect(scopedRows.map((r) => r.name)).toEqual(['skill-a']);

          // Proves the cache-keying fix in db/client.ts: executorPool() returns a
          // *different* Pool under maintenance() than under scoped() (admin pool vs
          // app pool), so coreDb()'s cache must be keyed on Pool identity — not
          // just "have we built one yet" — or this read would silently run back
          // through the scoped(tenantA) app-pool connection and still see one row.
          const adminRows = await maintenance(async () =>
            coreDb().select({ name: coreSkill.name }).from(coreSkill),
          );
          expect(adminRows.map((r) => r.name).sort()).toEqual(['skill-a', 'skill-b']);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
