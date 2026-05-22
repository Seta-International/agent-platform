import type { RerankedHit, Reranker } from './reranker.ts';
import type { RetrievalHit } from './types.ts';

/**
 * Pass-through reranker. Stage-1 RRF order is preserved; the `rerankScore`
 * mirrors the input `score` so downstream consumers can sort uniformly.
 *
 * Used when RERANKER_PROVIDER=none is set, or as the final fallback when
 * Cohere and LLM-judge both fail.
 */
export class NoopReranker implements Reranker {
  readonly providerId = 'noop' as const;

  async rescore<T>(
    _query: string,
    hits: RetrievalHit<T>[],
    opts: { topN?: number } = {},
  ): Promise<RerankedHit<T>[]> {
    const sliced = opts.topN != null ? hits.slice(0, opts.topN) : hits;
    return sliced.map((h) => ({ ...h, rerankScore: h.score, reranker: 'noop' as const }));
  }
}
