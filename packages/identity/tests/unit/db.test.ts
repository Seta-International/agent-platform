import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@seta/shared-db', () => ({
  getPool: vi.fn(() => ({ connect: vi.fn(), on: vi.fn() })),
}));

const mockDrizzleInstance = { _tag: 'drizzle' };
vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => mockDrizzleInstance),
}));

describe('identityDb caching', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
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
});
