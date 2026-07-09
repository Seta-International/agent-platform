import { withTestDb } from '@seta/shared-testing';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { closePools, executorPool, initPools, maintenance, scoped } from '../../src/index.ts';
// bindWebPool/unbindWebPool/makeTenantAwarePool aren't part of the public surface
// (index.ts) — they exist for exactly this kind of white-box test of the acquisition
// path, so we reach into the module directly rather than going through initPools().
import { bindWebPool, makeTenantAwarePool, unbindWebPool } from '../../src/request-tenant.ts';

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

/** The seta_app-role variant of a pooled test database's admin `databaseUrl` — factored
 * out since several tests below build the same connection string. */
function appRoleUrl(databaseUrl: string): string {
  return databaseUrl.replace(/\/\/[^@]+@/, '//seta_app:seta_app@');
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

        const appUrl = appRoleUrl(databaseUrl);
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
        const appUrl = appRoleUrl(databaseUrl);
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
        const appUrl = appRoleUrl(databaseUrl);
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
        const appUrl = appRoleUrl(databaseUrl);
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
        const appUrl = appRoleUrl(databaseUrl);
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

describe('pinTenantConnection: pool.connect() itself rejects (acquisition failure, not a query failure)', () => {
  it("surfaces the connection error, lets fn's own error win when it throws after acquisition already failed, and never leaks an unhandled rejection", async () => {
    // Real pg.Pool pointed at a port nothing listens on — a genuine connect() failure
    // against real infra, not a mock. connectionTimeoutMillis is short only so a
    // black-holed address (unlikely here) can't stall the test.
    const badPool = new Pool({
      connectionString: 'postgres://nobody:nobody@127.0.0.1:1/none',
      connectionTimeoutMillis: 200,
    });
    // bindWebPool() is what initPools() calls internally to flip webPoolState from
    // 'uninitialised'/'closed' to 'live'; calling it directly bypasses initPools()
    // (which can only construct pools from a connection string, not accept one) so we
    // can get pinTenantConnection past its 'uninitialised' fast path. The facade
    // below is what actually routes queries to badPool and fails on connect().
    bindWebPool();
    const facade = makeTenantAwarePool(badPool);

    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      // 1) Acquisition itself fails (pool.connect() rejects before any query runs).
      // The rejection scoped() surfaces must be that connection error, and
      // pinTenantConnection's `finally` (which awaits the same failed clientPromise)
      // must not throw a second, different error over it.
      await expect(
        scoped(TENANT_A, async () => {
          await facade.query('SELECT 1');
        }),
      ).rejects.toThrow(/ECONNREFUSED/);
      // Give any promise settled-but-unobserved during the above a chance to be
      // flagged before we assert on unhandledRejections below.
      await new Promise((resolve) => setImmediate(resolve));

      // 2) fn triggers and swallows the same kind of acquisition failure, then throws
      // its own error. scoped() must reject with fn's error, not the (already
      // memoised, already-rejected) connection error the `finally` also observes.
      await expect(
        scoped(TENANT_A, async () => {
          await facade.query('SELECT 1').catch(() => {});
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      await new Promise((resolve) => setImmediate(resolve));

      // 3) Neither scenario above should have produced a Node-level unhandled
      // rejection — the real risk with a memoised promise that rejects.
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
      // Restore webPoolState for sibling tests in this file: they call closePools()
      // in their own `finally`, which leaves webPoolState 'closed' (matching this).
      unbindWebPool();
      await badPool.end();
    }
  });
});

describe('pinTenantConnection cleans up a released connection before it returns to the pool', () => {
  it('a prepared statement from one scope does not leak into the next scope on the same connection', async () => {
    await withTestDb(
      { templateDbName: env.template(), baseUrl: env.base() },
      async ({ pool, databaseUrl }) => {
        await setupWidgetFixture(pool);
        const appUrl = appRoleUrl(databaseUrl);
        // webMax: 1 forces both scopes below to reuse the single physical connection,
        // so this is deterministic rather than depending on which pool member is idle.
        const pools = initPools({ databaseUrl, appDatabaseUrl: appUrl, webMax: 1 });
        try {
          await scoped(TENANT_A, async () => {
            await executorPool().query('PREPARE leak_probe AS SELECT 1');
          });

          const count = await scoped(TENANT_A, async () => {
            const r = await executorPool().query<{ count: string }>(
              "SELECT count(*) FROM pg_prepared_statements WHERE name = 'leak_probe'",
            );
            return Number(r.rows[0]?.count);
          });
          expect(count).toBe(0);
        } finally {
          await closePools();
        }
      },
    );
  });

  it('a scope left with an open transaction does not poison the pool for the next scope', async () => {
    await withTestDb(
      { templateDbName: env.template(), baseUrl: env.base() },
      async ({ pool, databaseUrl }) => {
        await setupWidgetFixture(pool);
        const appUrl = appRoleUrl(databaseUrl);
        const pools = initPools({ databaseUrl, appDatabaseUrl: appUrl, webMax: 1 });
        // 'remove' fires when a client is destroyed instead of returned to the pool
        // (client.release(true)) — the probe for "DISCARD ALL failed on an open
        // transaction, so the poisoned connection was destroyed, not reused."
        let removeCount = 0;
        // pg-pool's _remove() calls the real client.end() (a socket round trip) before
        // emitting 'remove', so it lands after client.release(true) returns, not
        // synchronously within it — wait for the event instead of racing it.
        const removed = new Promise<void>((resolve) => {
          pools.web.once('remove', () => resolve());
        });
        pools.web.on('remove', () => removeCount++);
        try {
          await scoped(TENANT_A, async () => {
            await executorPool().query('BEGIN');
            // Never COMMIT/ROLLBACK: the scope exits with an open transaction block.
          });
          await Promise.race([removed, new Promise((resolve) => setTimeout(resolve, 2000))]);
          expect(removeCount).toBe(1);

          const rows = await scoped(TENANT_A, async () => {
            const r = await executorPool().query<{ label: string }>(
              'SELECT label FROM public.widget',
            );
            return r.rows.map((x) => x.label);
          });
          expect(rows).toEqual(['a']);
        } finally {
          await closePools();
        }
      },
    );
  });
});
