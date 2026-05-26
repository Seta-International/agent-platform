import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stable Pool reference — must not change between getPool() calls or the
// pool-identity cache invalidates on every access.
const mockPool = { connect: vi.fn(), on: vi.fn() };
vi.mock('@seta/shared-db', () => ({
  getPool: vi.fn(() => mockPool),
}));

let drizzleCallCount = 0;
vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => ({ _tag: 'drizzle', n: ++drizzleCallCount })),
}));

describe('copilotDb caching', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    drizzleCallCount = 0;
    const { resetCopilotDb } = await import('../../src/backend/db/index.ts');
    resetCopilotDb();
  });

  it('returns the same instance on repeated calls', async () => {
    const { copilotDb } = await import('../../src/backend/db/index.ts');
    expect(copilotDb()).toBe(copilotDb());
  });

  it('resetCopilotDb clears the cache — next call rebuilds drizzle', async () => {
    const { copilotDb, resetCopilotDb } = await import('../../src/backend/db/index.ts');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const a = copilotDb();
    resetCopilotDb();
    const b = copilotDb();
    expect(drizzle).toHaveBeenCalledTimes(2);
    expect(a).not.toBe(b);
  });

  it('rebuilds when getPool returns a different Pool (post init/close cycle)', async () => {
    const sharedDb = await import('@seta/shared-db');
    const { copilotDb } = await import('../../src/backend/db/index.ts');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const a = copilotDb();
    const newPool = { connect: vi.fn(), on: vi.fn() };
    vi.mocked(sharedDb.getPool).mockReturnValueOnce(newPool as never);
    const b = copilotDb();
    expect(drizzle).toHaveBeenCalledTimes(2);
    expect(a).not.toBe(b);
  });
});
