import { describe, expect, it, vi } from 'vitest';
import { EmbedQueryCache } from '../src/embed-query-cache.ts';

describe('EmbedQueryCache', () => {
  it('returns cached vector on repeat query within TTL', async () => {
    const cache = new EmbedQueryCache({ maxEntries: 10, ttlMs: 60_000 });
    const compute = vi.fn(async () => [0.1, 0.2, 0.3]);

    const a = await cache.get('openai:small', 'hello', compute);
    const b = await cache.get('openai:small', 'hello', compute);

    expect(a).toEqual([0.1, 0.2, 0.3]);
    expect(b).toEqual([0.1, 0.2, 0.3]);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('keys by model_id — same query under different model is a miss', async () => {
    const cache = new EmbedQueryCache({ maxEntries: 10, ttlMs: 60_000 });
    const compute = vi.fn(async () => [0.1]);

    await cache.get('openai:small', 'q', compute);
    await cache.get('openai:large', 'q', compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('expires entries after ttlMs', async () => {
    vi.useFakeTimers();
    try {
      const cache = new EmbedQueryCache({ maxEntries: 10, ttlMs: 100 });
      const compute = vi.fn(async () => [0.1]);

      await cache.get('m', 'q', compute);
      vi.advanceTimersByTime(101);
      await cache.get('m', 'q', compute);

      expect(compute).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('evicts LRU when maxEntries exceeded', async () => {
    const cache = new EmbedQueryCache({ maxEntries: 2, ttlMs: 60_000 });
    const compute = vi.fn(async (q: string) => [q.length]);

    await cache.get('m', 'a', () => compute('a'));
    await cache.get('m', 'b', () => compute('b'));
    await cache.get('m', 'c', () => compute('c')); // evicts 'a'
    await cache.get('m', 'a', () => compute('a')); // miss again

    expect(compute).toHaveBeenCalledTimes(4);
  });
});
