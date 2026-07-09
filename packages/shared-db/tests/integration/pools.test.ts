import { beforeEach, describe, expect, it } from 'vitest';
import {
  closePools,
  executorPool,
  getPool,
  getPoolStats,
  initPools,
  maintenance,
  scoped,
} from '../../src/index.ts';

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

  it('executorPool() rejects after closePools instead of returning an ended pool', async () => {
    initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    await closePools();
    await expect(maintenance(async () => executorPool())).rejects.toThrow(
      /pools not initialised|before initPools/i,
    );
  });

  it('scoped() rejects after closePools instead of handing back an ended pool', async () => {
    initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    await closePools();
    await expect(
      scoped('11111111-1111-1111-1111-111111111111', async () => executorPool()),
    ).rejects.toThrow(/before initPools/);
  });

  it('initPools() after closePools rebinds executorPool cleanly', async () => {
    initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    await closePools();
    const created = initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    const pool = await maintenance(async () => executorPool());
    expect(pool).toBe(created.worker);
  });
});
