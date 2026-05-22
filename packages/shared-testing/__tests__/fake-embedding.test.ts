import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { describe, expect, it } from 'vitest';
import { FakeEmbeddingProvider } from '../src/fakes/embedding.ts';

describe('FakeEmbeddingProvider', () => {
  it('implements @seta/shared-embeddings EmbeddingProvider', () => {
    const provider: EmbeddingProvider = new FakeEmbeddingProvider({ dimensions: 1536 });
    expect(provider.modelId).toMatch(/^fake:/);
    expect(provider.dimensions).toBe(1536);
  });

  it('returns deterministic vectors keyed on text content (same input → same vector)', async () => {
    const p = new FakeEmbeddingProvider({ dimensions: 4 });
    const [a1] = await p.embed(['hello']);
    const [a2] = await p.embed(['hello']);
    expect(a1).toEqual(a2);
  });

  it('returns different vectors for different inputs', async () => {
    const p = new FakeEmbeddingProvider({ dimensions: 4 });
    const [a, b] = await p.embed(['a', 'b']);
    expect(a).not.toEqual(b);
  });

  it('produces unit-norm vectors of the requested dimension', async () => {
    const p = new FakeEmbeddingProvider({ dimensions: 8 });
    const [vec] = await p.embed(['x']);
    expect(vec).toHaveLength(8);
    const norm = Math.sqrt((vec as number[]).reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 6);
  });
});
