import { withTestDb } from '@seta/shared-testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closePools,
  executorPool,
  getPool,
  getPoolStats,
  initPools,
  maintenance,
  scoped,
} from '../../src/index.ts';

const env = {
  template: () => process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  base: () => process.env.PLATFORM_TEST_PG_BASE as string,
};

beforeEach(async () => {
  try {
    await closePools();
  } catch {
    // pools may not be initialized; closePools is idempotent
  }
});

describe('pools', () => {
  it('initPools returns three named pools at the configured sizes', () => {
    const pools = initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    expect(pools.web.options.max).toBe(15);
    expect(pools.worker.options.max).toBe(20);
    expect(pools.mastraState.options.max).toBe(5);
  });

  it('initPools sets safety timeouts on all pools', () => {
    const pools = initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    expect(pools.web.options.connectionTimeoutMillis).toBe(5_000);
    // worker intentionally has no connectionTimeoutMillis — graphile-worker holds
    // connections for each job's duration; a timeout would kill the process under load.
    expect(pools.worker.options.connectionTimeoutMillis).toBeUndefined();
    expect(pools.mastraState.options.connectionTimeoutMillis).toBe(5_000);
    expect(pools.web.options.idleTimeoutMillis).toBe(10_000);
    expect(pools.worker.options.idleTimeoutMillis).toBe(30_000);
    expect(pools.mastraState.options.idleTimeoutMillis).toBe(10_000);
  });

  it('initPools throws if called twice without closePools', () => {
    initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    expect(() => initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' })).toThrow(
      /already initialized/i,
    );
  });

  it('getPool returns the named pool', () => {
    initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    expect(getPool('web').options.max).toBe(15);
    expect(getPool('worker').options.max).toBe(20);
    expect(getPool('mastraState').options.max).toBe(5);
  });

  it('getPool throws if pools not initialized', async () => {
    await closePools();
    expect(() => getPool('web')).toThrow(/initPools/i);
  });

  it('overrides for max sizes are honored', () => {
    const pools = initPools({
      databaseUrl: 'postgres://x:y@127.0.0.1:1/none',
      webMax: 5,
      workerMax: 8,
      mastraStateMax: 2,
    });
    expect(pools.web.options.max).toBe(5);
    expect(pools.worker.options.max).toBe(8);
    expect(pools.mastraState.options.max).toBe(2);
  });

  it('getPoolStats returns shape with total/idle/waiting per pool', () => {
    initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    const stats = getPoolStats();
    expect(stats).not.toBeNull();
    expect(stats).toMatchObject({
      web: { total: expect.any(Number), idle: expect.any(Number), waiting: expect.any(Number) },
      worker: { total: expect.any(Number), idle: expect.any(Number), waiting: expect.any(Number) },
      mastraState: {
        total: expect.any(Number),
        idle: expect.any(Number),
        waiting: expect.any(Number),
      },
    });
  });

  it('getPoolStats returns null when pools not initialized', async () => {
    await closePools();
    expect(getPoolStats()).toBeNull();
  });
});

describe('pools bound into the executor', () => {
  it('maintenance() resolves executorPool() to the admin (worker) pool', async () => {
    const created = initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    const pool = await maintenance(async () => executorPool());
    expect(pool).toBe(created.worker);
  });

  it('maintenance() rejects after closePools before fn ever runs', async () => {
    // fn is never reached (maintenance() resolves the admin pool eagerly), so this
    // is also the only test that would catch a regression in executorPool()'s own
    // "before initPools" guard if the eager check in maintenance() were removed.
    initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    await closePools();
    await expect(maintenance(async () => executorPool())).rejects.toThrow(/before initPools/i);
  });

  it('maintenance() fails closed after closePools even when fn never touches the database', async () => {
    initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    await closePools();
    let ran = false;
    await expect(
      maintenance(async () => {
        ran = true;
      }),
    ).rejects.toThrow(/before initPools/);
    expect(ran).toBe(false);
  });

  it('scoped() rejects after closePools instead of handing back an ended pool', async () => {
    initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    await closePools();
    // pinTenantConnection now fails closed before fn ever runs, so the message
    // comes from there rather than from executorPool()'s own uninitialised guard.
    await expect(
      scoped('11111111-1111-1111-1111-111111111111', async () => executorPool()),
    ).rejects.toThrow(/after closePools/);
  });

  it('initPools() after closePools rebinds executorPool cleanly', async () => {
    initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    await closePools();
    const created = initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    const pool = await maintenance(async () => executorPool());
    expect(pool).toBe(created.worker);
  });

  it('scoped() fails closed after closePools even when fn never touches the database', async () => {
    initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    await closePools();
    let ran = false;
    await expect(
      scoped('11111111-1111-1111-1111-111111111111', async () => {
        ran = true;
      }),
    ).rejects.toThrow(/after closePools/);
    expect(ran).toBe(false);
  });

  it('scoped() no-ops as a pass-through when pools were never initialised', async () => {
    // Isolated via a fresh module graph so this genuinely observes "never
    // initialised" rather than whatever state earlier tests in this file left
    // the shared request-tenant module in.
    vi.resetModules();
    const fresh = await import('../../src/index.ts');
    let ran = false;
    await fresh.scoped('11111111-1111-1111-1111-111111111111', async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  it('maintenance() rejects when pools were never initialised, unlike scoped()', async () => {
    // Isolated via a fresh module graph, same as the scoped() case above. Unlike
    // scoped(), maintenance() has no no-op contract for the never-initialised
    // state, so it must fail closed here too.
    vi.resetModules();
    const fresh = await import('../../src/index.ts');
    let ran = false;
    await expect(
      fresh.maintenance(async () => {
        ran = true;
      }),
    ).rejects.toThrow(/before initPools/);
    expect(ran).toBe(false);
  });

  it('re-running initPools after closePools lets scoped() reach fn again', async () => {
    // Needs a real reachable database: unlike the closed-state test above, this
    // ends in a *live* pool, so pinTenantConnection actually opens a connection
    // and sets the tenant GUC instead of short-circuiting.
    await withTestDb({ templateDbName: env.template(), baseUrl: env.base() }, async (ctx) => {
      initPools({ databaseUrl: ctx.databaseUrl });
      await closePools();
      initPools({ databaseUrl: ctx.databaseUrl });
      let ran = false;
      await scoped('11111111-1111-1111-1111-111111111111', async () => {
        ran = true;
      });
      expect(ran).toBe(true);
      await closePools();
    });
  });
});
