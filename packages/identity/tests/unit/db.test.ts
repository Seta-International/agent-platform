import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPool = { connect: vi.fn(), on: vi.fn() };
vi.mock('@seta/shared-db', () => ({
  getPool: vi.fn(() => mockPool),
}));

let drizzleCallCount = 0;
vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => ({ _tag: 'drizzle', n: ++drizzleCallCount })),
}));

describe('identityDb caching', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    drizzleCallCount = 0;
    const { resetIdentityDb } = await import('../../src/backend/db/index.ts');
    resetIdentityDb();
  });

  it('returns the same instance on repeated calls', async () => {
    const { identityDb } = await import('../../src/backend/db/index.ts');
    expect(identityDb()).toBe(identityDb());
  });

  it('resetIdentityDb clears the cache', async () => {
    const { identityDb, resetIdentityDb } = await import('../../src/backend/db/index.ts');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    identityDb();
    resetIdentityDb();
    identityDb();
    expect(drizzle).toHaveBeenCalledTimes(2);
  });

  it('rebuilds when getPool returns a different Pool', async () => {
    const sharedDb = await import('@seta/shared-db');
    const { identityDb } = await import('../../src/backend/db/index.ts');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    identityDb();
    vi.mocked(sharedDb.getPool).mockReturnValueOnce({ connect: vi.fn(), on: vi.fn() } as never);
    identityDb();
    expect(drizzle).toHaveBeenCalledTimes(2);
  });
});
