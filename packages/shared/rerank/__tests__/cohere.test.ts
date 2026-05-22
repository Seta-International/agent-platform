import { describe, expect, it, vi } from 'vitest';

// Hoisted state shared between the top-level vi.mock factory and the test body.
// vi.mock is hoisted before imports, so we use vi.hoisted() to define mutable refs
// that both the factory and the test can access.
const mastraMocks = vi.hoisted(() => {
  const rerankWithScorer = vi.fn();
  class CohereRelevanceScorer {
    constructor(
      public model: string,
      public apiKey: string,
    ) {}
  }
  return { rerankWithScorer, CohereRelevanceScorer };
});

vi.mock('@mastra/rag', () => ({
  rerankWithScorer: mastraMocks.rerankWithScorer,
  CohereRelevanceScorer: mastraMocks.CohereRelevanceScorer,
}));

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

  it('scores the full hit set before truncating to topN (Bug 4 fix)', async () => {
    const capturedItems: unknown[] = [];
    const fakeRerank = vi.fn(async (_q: string, items: unknown[]) => {
      capturedItems.push(...items);
      return items.map((item, i) => ({ result: item, score: 1 - i / 100 }));
    });
    const r = new CohereReranker({ apiKey: 'k', rerankFn: fakeRerank as never });

    const hits = Array.from({ length: 50 }, (_, i) => ({
      item: { id: String(i) },
      score: 1 / (i + 1),
      rank: i + 1,
      source: 'hybrid' as const,
    }));

    const out = await r.rescore('q', hits, { topN: 10 });

    // The scorer must have received all 50 items, not just 10.
    expect(capturedItems).toHaveLength(50);
    // The result must be truncated to topN after scoring.
    expect(out).toHaveLength(10);
  });

  it('respects topN and assigns correct rank sequence', async () => {
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
    expect(out[0]?.rank).toBe(1);
    expect(out[1]?.rank).toBe(2);
  });
});

describe('CohereReranker.callMastraRerank real path (vi.mock intercept)', () => {
  it('passes topK=items.length, sets metadata.text, and maps results by id (Bugs 1+2+3)', async () => {
    // Items to rerank — Cohere returns them in reversed order.
    const items = [{ val: 'first' }, { val: 'second' }, { val: 'third' }];

    mastraMocks.rerankWithScorer.mockImplementation(
      async (args: {
        results: { id: string; score: number; metadata: Record<string, unknown> }[];
        query: string;
        scorer: unknown;
        options: { topK?: number };
      }) => {
        // Return results in reversed order to prove id-based mapping works.
        // Shape must match Mastra's RerankResult: { result: QueryResult, score, details }.
        return [...args.results].reverse().map((r) => ({
          result: r,
          score: 0.9,
          details: { semantic: 0.9, vector: 0, position: 0 },
        }));
      },
    );

    // Use a reranker without rerankFn so it falls through to callMastraRerank.
    const r = new CohereReranker({ apiKey: 'test-key' });
    const hits = items.map((item, i) => ({
      item,
      score: 0.5,
      rank: i + 1,
      source: 'hybrid' as const,
    }));

    const out = await r.rescore('my query', hits);

    // vi.mock calls: each call is [arg0, arg1, ...]; rerankWithScorer takes a single object arg.
    expect(mastraMocks.rerankWithScorer).toHaveBeenCalledOnce();
    const callArg = mastraMocks.rerankWithScorer.mock.calls[0]![0] as {
      results: { id: string; metadata: { text?: string } }[];
      options: { topK?: number };
    };

    // Bug 1: topK must equal the full item count.
    expect(callArg.options.topK).toBe(items.length);

    // Bug 2: each metadata entry must carry a `text` field for the cross-encoder.
    for (const result of callArg.results) {
      expect(typeof result.metadata.text).toBe('string');
      expect(result.metadata.text!.length).toBeGreaterThan(0);
    }

    // Bug 3: reversed input [2,1,0] should map back to items[2], items[1], items[0].
    expect(out[0]?.item.val).toBe('third');
    expect(out[1]?.item.val).toBe('second');
    expect(out[2]?.item.val).toBe('first');

    mastraMocks.rerankWithScorer.mockReset();
  });
});
