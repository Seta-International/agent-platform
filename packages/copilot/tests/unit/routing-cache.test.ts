import { describe, expect, it, vi } from 'vitest';
import {
  isCacheValid,
  type MemoryStore,
  readRoutingCache,
  writeRoutingCache,
} from '../../src/backend/routing-cache.ts';

function makeStore(overrides: Partial<MemoryStore> = {}): MemoryStore {
  return {
    getThreadById: vi.fn().mockResolvedValue(null),
    updateThread: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

describe('isCacheValid', () => {
  it('returns true for cache younger than 30 minutes', () => {
    const cache = { domain: 'work' as const, cachedAt: new Date().toISOString() };
    expect(isCacheValid(cache)).toBe(true);
  });

  it('returns false for cache older than 30 minutes', () => {
    const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const cache = { domain: 'work' as const, cachedAt: old };
    expect(isCacheValid(cache)).toBe(false);
  });
});

describe('readRoutingCache', () => {
  it('returns null cache when thread not found', async () => {
    const store = makeStore({ getThreadById: vi.fn().mockResolvedValue(null) });
    const result = await readRoutingCache(store, 'thread-1');
    expect(result.cache).toBeNull();
  });

  it('returns null cache when metadata has no routingCache', async () => {
    const store = makeStore({
      getThreadById: vi.fn().mockResolvedValue({ id: 't1', resourceId: 'u1', metadata: {} }),
    });
    const result = await readRoutingCache(store, 't1');
    expect(result.cache).toBeNull();
  });

  it('returns valid cache when present and fresh', async () => {
    const cachedAt = new Date().toISOString();
    const store = makeStore({
      getThreadById: vi.fn().mockResolvedValue({
        id: 't1',
        resourceId: 'u1',
        title: 'my thread',
        metadata: { routingCache: { domain: 'work', cachedAt } },
      }),
    });
    const result = await readRoutingCache(store, 't1');
    expect(result.cache).toEqual({ domain: 'work', cachedAt });
    expect(result.threadTitle).toBe('my thread');
  });

  it('returns null cache when routingCache is expired', async () => {
    const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const store = makeStore({
      getThreadById: vi.fn().mockResolvedValue({
        id: 't1',
        resourceId: 'u1',
        metadata: { routingCache: { domain: 'people', cachedAt: old } },
      }),
    });
    const result = await readRoutingCache(store, 't1');
    expect(result.cache).toBeNull();
    expect(result.existingMetadata).toHaveProperty('routingCache');
  });

  it('returns null cache when domain is an unknown value', async () => {
    const store = makeStore({
      getThreadById: vi.fn().mockResolvedValue({
        id: 't1',
        resourceId: 'u1',
        metadata: {
          routingCache: { domain: 'unknown-domain', cachedAt: new Date().toISOString() },
        },
      }),
    });
    const result = await readRoutingCache(store, 't1');
    expect(result.cache).toBeNull();
  });

  it('returns null cache without throwing when store throws', async () => {
    const store = makeStore({
      getThreadById: vi.fn().mockRejectedValue(new Error('db error')),
    });
    const result = await readRoutingCache(store, 't1');
    expect(result.cache).toBeNull();
  });
});

describe('writeRoutingCache', () => {
  it('calls updateThread with merged metadata preserving existing keys', async () => {
    const updateThread = vi.fn().mockResolvedValue({});
    const store = makeStore({ updateThread });
    await writeRoutingCache(store, 't1', 'knowledge', {
      existingMetadata: { someOtherKey: 'value' },
      threadTitle: 'My Thread',
    });
    expect(updateThread).toHaveBeenCalledOnce();
    const call = updateThread.mock.calls[0][0];
    expect(call.id).toBe('t1');
    expect(call.title).toBe('My Thread');
    expect(call.metadata.someOtherKey).toBe('value');
    expect(call.metadata.routingCache.domain).toBe('knowledge');
    expect(typeof call.metadata.routingCache.cachedAt).toBe('string');
  });

  it('does not throw when updateThread rejects', async () => {
    const store = makeStore({
      updateThread: vi.fn().mockRejectedValue(new Error('write failed')),
    });
    await expect(
      writeRoutingCache(store, 't1', 'self', { existingMetadata: {}, threadTitle: null }),
    ).resolves.toBeUndefined();
  });
});
