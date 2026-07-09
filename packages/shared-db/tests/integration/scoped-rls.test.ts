import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { closePools, executorPool, initPools, maintenance, scoped } from '../../src/index.ts';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

const env = {
  template: () => process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  base: () => process.env.PLATFORM_TEST_PG_BASE as string,
};

/** Shared widget/seta_app fixture for the laziness tests below — same shape as the
 * RLS test above, factored out since five tests would otherwise repeat it verbatim. */
async function setupWidgetFixture(pool: Pool): Promise<void> {
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
}

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

describe('scoped() acquires the tenant connection lazily', () => {
  it('does not check out a connection when fn never queries', async () => {
    await withTestDb(
      { templateDbName: env.template(), baseUrl: env.base() },
      async ({ databaseUrl }) => {
        const pools = initPools({ databaseUrl });
        // 'acquire' fires on every checkout from the pool (new or reused client) — a
        // more direct probe than totalCount/idleCount, which only reflect pool
        // membership and can't distinguish "never touched" from "acquired then idled".
        let acquireCount = 0;
        pools.web.on('acquire', () => acquireCount++);
        try {
          await scoped(TENANT_A, async () => {});
          expect(acquireCount).toBe(0);
        } finally {
          await closePools();
        }
      },
    );
  });

  it('one query triggers exactly one connection acquire with the correct tenant GUC', async () => {
    await withTestDb(
      { templateDbName: env.template(), baseUrl: env.base() },
      async ({ pool, databaseUrl }) => {
        await setupWidgetFixture(pool);
        const appUrl = databaseUrl.replace(/\/\/[^@]+@/, '//seta_app:seta_app@');
        const pools = initPools({ databaseUrl, appDatabaseUrl: appUrl });
        let acquireCount = 0;
        pools.web.on('acquire', () => acquireCount++);
        try {
          const rows = await scoped(TENANT_A, async () => {
            const r = await executorPool().query<{ label: string }>(
              'SELECT label FROM public.widget',
            );
            return r.rows.map((x) => x.label);
          });
          expect(rows).toEqual(['a']);
          expect(acquireCount).toBe(1);
        } finally {
          await closePools();
        }
      },
    );
  });

  it('two concurrent queries in one scoped() share a single connection', async () => {
    await withTestDb(
      { templateDbName: env.template(), baseUrl: env.base() },
      async ({ pool, databaseUrl }) => {
        await setupWidgetFixture(pool);
        const appUrl = databaseUrl.replace(/\/\/[^@]+@/, '//seta_app:seta_app@');
        const pools = initPools({ databaseUrl, appDatabaseUrl: appUrl });
        let acquireCount = 0;
        pools.web.on('acquire', () => acquireCount++);
        try {
          // Fires two queries without awaiting between them, inside one scoped(): if
          // acquire() memoised the *client* instead of the *promise*, both would race
          // pool.connect() and this would observe two acquires.
          const [r1, r2] = await scoped(TENANT_A, () =>
            Promise.all([
              executorPool().query<{ label: string }>('SELECT label FROM public.widget'),
              executorPool().query<{ label: string }>('SELECT label FROM public.widget'),
            ]),
          );
          expect(r1.rows.map((x) => x.label)).toEqual(['a']);
          expect(r2.rows.map((x) => x.label)).toEqual(['a']);
          expect(acquireCount).toBe(1);
        } finally {
          await closePools();
        }
      },
    );
  });

  it('nested scoped(A) -> scoped(B) gives the inner scope its own connection and GUC, leaving the outer untouched', async () => {
    await withTestDb(
      { templateDbName: env.template(), baseUrl: env.base() },
      async ({ pool, databaseUrl }) => {
        await setupWidgetFixture(pool);
        const appUrl = databaseUrl.replace(/\/\/[^@]+@/, '//seta_app:seta_app@');
        const pools = initPools({ databaseUrl, appDatabaseUrl: appUrl });
        let acquireCount = 0;
        pools.web.on('acquire', () => acquireCount++);
        try {
          await scoped(TENANT_A, async () => {
            const outerBefore = await executorPool().query<{ label: string }>(
              'SELECT label FROM public.widget',
            );
            expect(outerBefore.rows.map((x) => x.label)).toEqual(['a']);

            await scoped(TENANT_B, async () => {
              const inner = await executorPool().query<{ label: string }>(
                'SELECT label FROM public.widget',
              );
              expect(inner.rows.map((x) => x.label)).toEqual(['b']);
            });

            const outerAfter = await executorPool().query<{ label: string }>(
              'SELECT label FROM public.widget',
            );
            expect(outerAfter.rows.map((x) => x.label)).toEqual(['a']);
          });
          // outer's first query + outer's second query share one memoised connection;
          // the inner scope gets its own — two acquires total, not three.
          expect(acquireCount).toBe(2);
        } finally {
          await closePools();
        }
      },
    );
  });

  it('releases the connection back to the pool when fn throws', async () => {
    await withTestDb(
      { templateDbName: env.template(), baseUrl: env.base() },
      async ({ pool, databaseUrl }) => {
        await setupWidgetFixture(pool);
        const appUrl = databaseUrl.replace(/\/\/[^@]+@/, '//seta_app:seta_app@');
        const pools = initPools({ databaseUrl, appDatabaseUrl: appUrl });
        let acquireCount = 0;
        let releaseCount = 0;
        pools.web.on('acquire', () => acquireCount++);
        pools.web.on('release', () => releaseCount++);
        try {
          await expect(
            scoped(TENANT_A, async () => {
              await executorPool().query('SELECT label FROM public.widget');
              throw new Error('boom');
            }),
          ).rejects.toThrow('boom');
          expect(acquireCount).toBe(1);
          expect(releaseCount).toBe(1);
          expect(pools.web.idleCount).toBe(1);
        } finally {
          await closePools();
        }
      },
    );
  });
});
