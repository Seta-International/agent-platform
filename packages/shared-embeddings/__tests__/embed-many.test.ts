import { describe, expect, it, vi } from 'vitest';
import { embedMany } from '../src/embed-many.ts';
import type { EmbeddingProvider } from '../src/index.ts';

const fakeProvider = (impl: (texts: string[]) => Promise<number[][]>): EmbeddingProvider => ({
  modelId: 'fake:test',
  dimensions: 3,
  embed: impl,
});

describe('embedMany', () => {
  it('forwards a single batch unchanged when input < batchSize', async () => {
    const inner = vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]));
    const provider = fakeProvider(inner);

    const result = await embedMany(provider, ['a', 'b', 'c'], { batchSize: 100 });

    expect(inner).toHaveBeenCalledTimes(1);
    expect(inner).toHaveBeenCalledWith(['a', 'b', 'c']);
    expect(result).toHaveLength(3);
  });

  it('splits input into multiple batches of batchSize', async () => {
    const inner = vi.fn(async (texts: string[]) => texts.map(() => [0]));
    const provider = fakeProvider(inner);

    await embedMany(provider, ['a', 'b', 'c', 'd', 'e'], { batchSize: 2 });

    expect(inner).toHaveBeenCalledTimes(3);
    expect(inner.mock.calls[0]?.[0]).toEqual(['a', 'b']);
    expect(inner.mock.calls[1]?.[0]).toEqual(['c', 'd']);
    expect(inner.mock.calls[2]?.[0]).toEqual(['e']);
  });

  it('returns vectors in input order even across batches', async () => {
    let counter = 0;
    const inner = async (texts: string[]) =>
      texts.map(() => {
        counter += 1;
        return [counter];
      });
    const provider = fakeProvider(inner);

    const result = await embedMany(provider, ['a', 'b', 'c', 'd'], { batchSize: 2 });

    expect(result).toEqual([[1], [2], [3], [4]]);
  });

  it('retries on transient failure (max 3 attempts)', async () => {
    let attempts = 0;
    const inner = vi.fn(async (texts: string[]) => {
      attempts += 1;
      if (attempts < 3) throw new Error('flaky');
      return texts.map(() => [0]);
    });
    const provider = fakeProvider(inner);

    const result = await embedMany(provider, ['a'], {
      batchSize: 100,
      maxAttempts: 3,
      initialBackoffMs: 1,
    });

    expect(result).toEqual([[0]]);
    expect(attempts).toBe(3);
  });

  it('surfaces the error after maxAttempts', async () => {
    const inner = vi.fn(async () => {
      throw new Error('always fails');
    });
    const provider = fakeProvider(inner);

    await expect(
      embedMany(provider, ['a'], { batchSize: 100, maxAttempts: 2, initialBackoffMs: 1 }),
    ).rejects.toThrow(/always fails/);
    expect(inner).toHaveBeenCalledTimes(2);
  });
});
