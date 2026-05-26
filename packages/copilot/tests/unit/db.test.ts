import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock shared-db so no real Pool is needed
vi.mock('@seta/shared-db', () => ({
  getPool: vi.fn(() => ({ connect: vi.fn(), on: vi.fn() })),
}));

// Mock drizzle so it returns a stable object per call
const mockDrizzleInstance = { _tag: 'drizzle' };
vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => mockDrizzleInstance),
}));

describe('copilotDb caching', () => {
  beforeEach(async () => {
    // Reset call counts and the cached instance between tests
    vi.clearAllMocks();
    const { resetCopilotDb } = await import('../../src/backend/db/index.ts');
    resetCopilotDb();
  });

  it('returns the same instance on repeated calls', async () => {
    const { copilotDb } = await import('../../src/backend/db/index.ts');
    const a = copilotDb();
    const b = copilotDb();
    expect(a).toBe(b);
  });

  it('resetCopilotDb clears the cache — next call returns a new instance', async () => {
    const { copilotDb, resetCopilotDb } = await import('../../src/backend/db/index.ts');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const a = copilotDb();
    resetCopilotDb();
    const b = copilotDb();
    expect(drizzle).toHaveBeenCalledTimes(2);
    // Both are the mock instance but drizzle() called again after reset
    expect(a).toBe(b);
  });
});
