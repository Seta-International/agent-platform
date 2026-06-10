import { describe, expect, it } from 'vitest';
import { embedManyWithUsage } from '../../src/embed-many.ts';
import type { EmbeddingProvider } from '../../src/provider.ts';

const fakeProvider: EmbeddingProvider = {
  modelId: 'openai:text-embedding-3-small',
  dimensions: 3,
  embed: async (texts) => texts.map(() => [0, 0, 0]),
  embedWithUsage: async (texts) => ({
    vectors: texts.map(() => [0, 0, 0]),
    tokens: texts.length * 5,
  }),
};

describe('embedManyWithUsage', () => {
  it('returns vectors and summed token usage across batches', async () => {
    const res = await embedManyWithUsage(fakeProvider, ['a', 'b', 'c'], { batchSize: 2 });
    expect(res.vectors).toHaveLength(3);
    expect(res.tokens).toBe(15); // 3 texts * 5
  });

  it('returns zero tokens for empty input', async () => {
    const res = await embedManyWithUsage(fakeProvider, []);
    expect(res).toEqual({ vectors: [], tokens: 0 });
  });
});
