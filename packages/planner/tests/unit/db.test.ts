import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPool = { connect: vi.fn(), on: vi.fn() };
vi.mock('@seta/shared-db', () => ({
  getPool: vi.fn(() => mockPool),
}));

let drizzleCallCount = 0;
vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => ({ _tag: 'drizzle', n: ++drizzleCallCount })),
}));

describe('plannerDb caching', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    drizzleCallCount = 0;
    const { resetPlannerDb } = await import('../../src/backend/db/index.ts');
    resetPlannerDb();
  });

  it('returns the same instance on repeated calls', async () => {
    const { plannerDb } = await import('../../src/backend/db/index.ts');
    expect(plannerDb()).toBe(plannerDb());
  });

  it('resetPlannerDb clears the cache', async () => {
    const { plannerDb, resetPlannerDb } = await import('../../src/backend/db/index.ts');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    plannerDb();
    resetPlannerDb();
    plannerDb();
    expect(drizzle).toHaveBeenCalledTimes(2);
  });

  it('rebuilds when getPool returns a different Pool', async () => {
    const sharedDb = await import('@seta/shared-db');
    const { plannerDb } = await import('../../src/backend/db/index.ts');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    plannerDb();
    vi.mocked(sharedDb.getPool).mockReturnValueOnce({ connect: vi.fn(), on: vi.fn() } as never);
    plannerDb();
    expect(drizzle).toHaveBeenCalledTimes(2);
  });
});
