import { describe, expect, it } from 'vitest';
import type { EmbeddingProvider } from '../src/index.ts';

describe('EmbeddingProvider type', () => {
  it('exposes a callable shape with modelId and embed(texts)', async () => {
    const fake: EmbeddingProvider = {
      modelId: 'fake:test',
      dimensions: 3,
      async embed(texts: string[]) {
        return texts.map(() => [0, 0, 0]);
      },
    };

    expect(fake.modelId).toBe('fake:test');
    expect(fake.dimensions).toBe(3);
    const vectors = await fake.embed(['a', 'b']);
    expect(vectors).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });
});
