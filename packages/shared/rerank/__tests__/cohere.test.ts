import { describe, expect, it, vi } from 'vitest';
import { CohereReranker } from '../src/cohere.ts';

describe('CohereReranker', () => {
  it('calls the underlying rerank with weight config and tags result reranker="cohere"', async () => {
    const fakeRerank = vi.fn(async (_q: string, hits: { id: string }[]) => {
      // Pretend Cohere flips a and b.
      return [
        { result: hits[1]!, score: 0.95 },
        { result: hits[0]!, score: 0.4 },
      ];
    });
    const r = new CohereReranker({ apiKey: 'k', rerankFn: fakeRerank as never });

    const hits = [
      { item: { id: 'a' }, score: 0.5, rank: 1, source: 'hybrid' as const },
      { item: { id: 'b' }, score: 0.4, rank: 2, source: 'hybrid' as const },
    ];
    const out = await r.rescore('test query', hits);

    expect(out[0]?.item.id).toBe('b');
    expect(out[0]?.rerankScore).toBe(0.95);
    expect(out[0]?.reranker).toBe('cohere');
  });

  it('falls back to stage-1 order when rerankFn throws', async () => {
    const rerankFn = vi.fn(async () => {
      throw new Error('cohere 429');
    });
    const r = new CohereReranker({ apiKey: 'k', rerankFn: rerankFn as never });

    const hits = [
      { item: { id: 'a' }, score: 0.9, rank: 1, source: 'hybrid' as const },
      { item: { id: 'b' }, score: 0.7, rank: 2, source: 'hybrid' as const },
    ];
    const out = await r.rescore('q', hits);

    expect(out.map((h) => h.item.id)).toEqual(['a', 'b']);
    expect(out[0]?.reranker).toBe('fallback');
  });

  it('respects topN', async () => {
    const fakeRerank = vi.fn(async (_q: string, hits: { id: string }[]) =>
      hits.map((h, i) => ({ result: h, score: 1 - i / 10 })),
    );
    const r = new CohereReranker({ apiKey: 'k', rerankFn: fakeRerank as never });
    const hits = [1, 2, 3, 4, 5].map((i) => ({
      item: { id: String(i) },
      score: 1 / i,
      rank: i,
      source: 'hybrid' as const,
    }));
    const out = await r.rescore('q', hits, { topN: 2 });
    expect(out).toHaveLength(2);
  });
});
