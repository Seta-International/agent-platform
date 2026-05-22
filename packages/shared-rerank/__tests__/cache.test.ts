import { describe, expect, it, vi } from 'vitest';
import { RerankCache } from '../src/cache.ts';

describe('RerankCache', () => {
  it('returns cached order on repeat same-query-same-docs call', async () => {
    const cache = new RerankCache({ maxEntries: 10, ttlMs: 60_000 });
    const compute = vi.fn(async () => ['b', 'a', 'c']);

    const a = await cache.get('q', ['a', 'b', 'c'], compute);
    const b = await cache.get('q', ['a', 'b', 'c'], compute);

    expect(a).toEqual(['b', 'a', 'c']);
    expect(b).toEqual(['b', 'a', 'c']);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('different doc sets are different keys', async () => {
    const cache = new RerankCache({ maxEntries: 10, ttlMs: 60_000 });
    const compute = vi.fn(async (docs: string[]) => [...docs].reverse());

    await cache.get('q', ['a', 'b'], () => compute(['a', 'b']));
    await cache.get('q', ['a', 'b', 'c'], () => compute(['a', 'b', 'c']));

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('canonicalizes doc id order — same set in different order is same key', async () => {
    const cache = new RerankCache({ maxEntries: 10, ttlMs: 60_000 });
    const compute = vi.fn(async () => ['x']);

    await cache.get('q', ['a', 'b', 'c'], compute);
    await cache.get('q', ['c', 'a', 'b'], compute);

    expect(compute).toHaveBeenCalledTimes(1);
  });
});
