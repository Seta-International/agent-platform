import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RouterEmbeddingProvider } from '../../src/router-provider.ts';

describe('RouterEmbeddingProvider', () => {
  // The router validates its provider key at construction; tests never make a
  // real embedding call, so a dummy key is enough.
  beforeAll(() => {
    process.env.OPENAI_API_KEY ??= 'test-key';
  });

  it('exposes modelId as provider:model and dimensions from the known table', () => {
    const p = new RouterEmbeddingProvider('openai/text-embedding-3-small');
    expect(p.modelId).toBe('openai:text-embedding-3-small');
    expect(p.dimensions).toBe(1536);
  });

  it('reads dimensions for the large model', () => {
    expect(new RouterEmbeddingProvider('openai/text-embedding-3-large').dimensions).toBe(3072);
  });

  it('throws for an unknown embedding model (no dimensions available)', () => {
    expect(() => new RouterEmbeddingProvider('openai/text-embedding-unknown')).toThrow(
      /unknown embedding model/i,
    );
  });

  it('embed() delegates to the router model doEmbed and returns vectors in order', async () => {
    const p = new RouterEmbeddingProvider('openai/text-embedding-3-small');
    const router = (p as unknown as { router: { doEmbed: (a: unknown) => Promise<unknown> } })
      .router;
    const spy = vi.spyOn(router, 'doEmbed').mockResolvedValue({
      embeddings: [
        [1, 2],
        [3, 4],
      ],
    });
    const out = await p.embed(['a', 'b']);
    expect(out).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(spy).toHaveBeenCalledWith({ values: ['a', 'b'] });
  });

  afterEach(() => vi.restoreAllMocks());
});
