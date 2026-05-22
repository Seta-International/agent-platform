import { describe, expect, it } from 'vitest';
import { NoopReranker } from '../src/noop.ts';

describe('NoopReranker', () => {
  it('returns input hits unchanged, tagged reranker="noop"', async () => {
    const r = new NoopReranker();
    const hits = [
      { item: { id: 'a' }, score: 0.9, rank: 1, source: 'hybrid' as const },
      { item: { id: 'b' }, score: 0.7, rank: 2, source: 'hybrid' as const },
    ];
    const out = await r.rescore('q', hits);

    expect(out).toHaveLength(2);
    expect(out[0]?.item).toEqual({ id: 'a' });
    expect(out[0]?.rerankScore).toBe(0.9);
    expect(out[0]?.reranker).toBe('noop');
  });

  it('respects topN truncation', async () => {
    const r = new NoopReranker();
    const hits = [1, 2, 3, 4, 5].map((i) => ({
      item: { id: String(i) },
      score: 1 / i,
      rank: i,
      source: 'hybrid' as const,
    }));
    const out = await r.rescore('q', hits, { topN: 3 });
    expect(out).toHaveLength(3);
  });

  it('providerId is "noop"', () => {
    expect(new NoopReranker().providerId).toBe('noop');
  });
});
