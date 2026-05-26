import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

// OTEL API is a no-op by default in tests — safe to import without SDK setup.
import { instrumentPool } from '../../src/instrumentation.ts';

function makeFakePool(): Pool {
  const fakeClient = { release: vi.fn() };
  const pool = {
    totalCount: 3,
    idleCount: 2,
    waitingCount: 0,
    connect: vi.fn().mockResolvedValue(fakeClient),
    on: vi.fn(),
  } as unknown as Pool;
  return pool;
}

describe('instrumentPool', () => {
  it('does not break pool.connect() — returns the client', async () => {
    const pool = makeFakePool();
    instrumentPool(pool, 'web');
    const client = await pool.connect();
    expect(client).toBeDefined();
    expect((client as { release: ReturnType<typeof vi.fn> }).release).toBeDefined();
  });

  it('calls the original connect exactly once per acquire', async () => {
    const pool = makeFakePool();
    const origConnect = pool.connect as ReturnType<typeof vi.fn>;
    instrumentPool(pool, 'web');
    await pool.connect();
    await pool.connect();
    expect(origConnect).toHaveBeenCalledTimes(2);
  });

  it('propagates connect() rejection without swallowing', async () => {
    const pool = makeFakePool();
    (pool.connect as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('timeout exceeded when trying to connect'),
    );
    instrumentPool(pool, 'web');
    await expect(pool.connect()).rejects.toThrow('timeout exceeded');
  });

  it('can instrument multiple pools with different names without error', () => {
    const web = makeFakePool();
    const worker = makeFakePool();
    expect(() => instrumentPool(web, 'web')).not.toThrow();
    expect(() => instrumentPool(worker, 'worker')).not.toThrow();
  });
});
