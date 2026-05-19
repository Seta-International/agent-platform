import { beforeEach, describe, expect, it } from 'vitest';
import { closePools, getPool, initPools } from '../src/pools.ts';

beforeEach(async () => {
  try {
    await closePools();
  } catch {
    // empty: pools may not be initialized; closePools is idempotent
  }
});

describe('pools', () => {
  it('initPools returns three named pools at the configured sizes', () => {
    const pools = initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    expect(pools.web.options.max).toBe(15);
    expect(pools.worker.options.max).toBe(10);
    expect(pools.mastraState.options.max).toBe(5);
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
    expect(getPool('worker').options.max).toBe(10);
    expect(getPool('mastraState').options.max).toBe(5);
  });

  it('getPool throws if pools not initialized', async () => {
    await closePools();
    expect(() => getPool('web')).toThrow(/initPools/i);
  });

  it('overrides for max sizes are honored', () => {
    const pools = initPools({
      databaseUrl: 'postgres://x:y@127.0.0.1:1/none',
      webMax: 3,
      workerMax: 2,
      mastraStateMax: 1,
    });
    expect(pools.web.options.max).toBe(3);
    expect(pools.worker.options.max).toBe(2);
    expect(pools.mastraState.options.max).toBe(1);
  });
});
