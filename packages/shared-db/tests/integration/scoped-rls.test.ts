import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { closePools, executorPool, initPools, maintenance, scoped } from '../../src/index.ts';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

const env = {
  template: () => process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  base: () => process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('scoped() is tenant-blind, maintenance() is not', () => {
  it('an app-role connection inside scoped(A) cannot see tenant B rows', async () => {
    await withTestDb(
      { templateDbName: env.template(), baseUrl: env.base() },
      async ({ pool, databaseUrl }) => {
        await pool.query(`
          CREATE TABLE public.widget (tenant_id uuid NOT NULL, label text NOT NULL);
          ALTER TABLE public.widget ENABLE ROW LEVEL SECURITY;
          ALTER TABLE public.widget FORCE ROW LEVEL SECURITY;
          CREATE POLICY tenant_isolation ON public.widget
            USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
            WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
          INSERT INTO public.widget VALUES ('${TENANT_A}', 'a'), ('${TENANT_B}', 'b');
          -- seta_app is cluster-scoped and outlives the per-run database on a reused
          -- container, with grants on other still-live test databases depending on it —
          -- DROP ROLE fails there. Create-if-missing then re-assert attributes instead.
          DO $do$
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seta_app') THEN
              CREATE ROLE seta_app LOGIN PASSWORD 'seta_app' NOSUPERUSER NOBYPASSRLS;
            END IF;
          END
          $do$;
          ALTER ROLE seta_app LOGIN PASSWORD 'seta_app' NOSUPERUSER NOBYPASSRLS;
          GRANT USAGE ON SCHEMA public TO seta_app;
          GRANT SELECT ON public.widget TO seta_app;
        `);

        const appUrl = databaseUrl.replace(/\/\/[^@]+@/, '//seta_app:seta_app@');
        initPools({ databaseUrl, appDatabaseUrl: appUrl });
        try {
          const scopedRows = await scoped(TENANT_A, async () => {
            const r = await executorPool().query<{ label: string }>(
              'SELECT label FROM public.widget',
            );
            return r.rows.map((x) => x.label);
          });
          expect(scopedRows).toEqual(['a']);

          const adminRows = await maintenance(async () => {
            const r = await executorPool().query<{ label: string }>(
              'SELECT label FROM public.widget',
            );
            return r.rows.map((x) => x.label);
          });
          expect(adminRows.sort()).toEqual(['a', 'b']);
        } finally {
          await closePools();
        }
      },
    );
  });

  it('falls back to the admin pool when appDatabaseUrl is unset (documented self-host behaviour: the backstop is inert)', async () => {
    await withTestDb(
      { templateDbName: env.template(), baseUrl: env.base() },
      async ({ pool, databaseUrl }) => {
        await pool.query(`
          CREATE TABLE public.widget (tenant_id uuid NOT NULL, label text NOT NULL);
          ALTER TABLE public.widget ENABLE ROW LEVEL SECURITY;
          ALTER TABLE public.widget FORCE ROW LEVEL SECURITY;
          CREATE POLICY tenant_isolation ON public.widget
            USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
          INSERT INTO public.widget VALUES ('${TENANT_A}', 'a'), ('${TENANT_B}', 'b');
        `);
        initPools({ databaseUrl }); // no appDatabaseUrl
        try {
          const rows = await scoped(TENANT_A, async () => {
            const r = await executorPool().query<{ label: string }>(
              'SELECT label FROM public.widget',
            );
            return r.rows.map((x) => x.label);
          });
          // Self-host without appDatabaseUrl: scoped() runs on the same admin
          // (BYPASSRLS) pool as everything else, so the RLS backstop is inert by
          // design here — see the `||` fallback comment in pools.ts.
          expect(rows.sort()).toEqual(['a', 'b']);
        } finally {
          await closePools();
        }
      },
    );
  });
});
