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

describe('agentDb caching', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    drizzleCallCount = 0;
    const { resetAgentDb } = await import('../../src/backend/db/index.ts');
    resetAgentDb();
  });

  it('returns the same instance on repeated calls', async () => {
    const { agentDb } = await import('../../src/backend/db/index.ts');
    expect(agentDb()).toBe(agentDb());
  });

  it('resetAgentDb clears the cache — next call rebuilds drizzle', async () => {
    const { agentDb, resetAgentDb } = await import('../../src/backend/db/index.ts');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const a = agentDb();
    resetAgentDb();
    const b = agentDb();
    expect(drizzle).toHaveBeenCalledTimes(2);
    expect(a).not.toBe(b);
  });

  it('rebuilds when getPool returns a different Pool (post init/close cycle)', async () => {
    const sharedDb = await import('@seta/shared-db');
    const { agentDb } = await import('../../src/backend/db/index.ts');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const a = agentDb();
    const newPool = { connect: vi.fn(), on: vi.fn() };
    vi.mocked(sharedDb.getPool).mockReturnValueOnce(newPool as never);
    const b = agentDb();
    expect(drizzle).toHaveBeenCalledTimes(2);
    expect(a).not.toBe(b);
  });
});
