import type { RetrievalHit } from '@seta/shared-retrieval';
import type { RerankedHit, Reranker } from './reranker.ts';

export interface CohereRerankerOptions {
  apiKey: string;
  model?: 'rerank-v3.5' | 'rerank-multilingual-v3.0';
  /** Override for tests — defaults to a real call into @mastra/rag.rerank + CohereRelevanceScorer. */
  rerankFn?: <T>(
    query: string,
    items: T[],
    apiKey: string,
    model: string,
  ) => Promise<{ result: T; score: number }[]>;
  /** Score-blend weights (spec §5.3): semantic 0.6, vector 0.3, position 0.1. Currently unused but reserved. */
  weights?: { semantic: number; vector: number; position: number };
}

/**
 * Cohere `rerank-v3.5` cross-encoder. Stage-2 precision lift over RRF.
 *
 * Failures (network, 429, auth) are caught here — the tool layer never throws.
 * Caller gets stage-1 order back with reranker='fallback'.
 */
export class CohereReranker implements Reranker {
  readonly providerId = 'cohere' as const;
  private readonly opts: Required<Pick<CohereRerankerOptions, 'apiKey' | 'model'>> &
    CohereRerankerOptions;

  constructor(opts: CohereRerankerOptions) {
    this.opts = {
      model: 'rerank-v3.5',
      ...opts,
      apiKey: opts.apiKey,
    };
  }

  async rescore<T>(
    query: string,
    hits: RetrievalHit<T>[],
    callOpts: { topN?: number } = {},
  ): Promise<RerankedHit<T>[]> {
    const sliced = callOpts.topN != null ? hits.slice(0, callOpts.topN) : hits;
    if (sliced.length === 0) return [];

    try {
      const fn = this.opts.rerankFn ?? this.callMastraRerank;
      const scored = await fn(
        query,
        sliced.map((h) => h.item),
        this.opts.apiKey,
        this.opts.model,
      );

      // Map back to a RerankedHit preserving the original RetrievalHit fields.
      const byItem = new Map(sliced.map((h) => [h.item, h]));
      return scored.map((s, i) => {
        const orig = byItem.get(s.result)!;
        return { ...orig, rerankScore: s.score, rank: i + 1, reranker: 'cohere' as const };
      });
    } catch {
      return sliced.map((h, i) => ({
        ...h,
        rerankScore: h.score,
        rank: i + 1,
        reranker: 'fallback' as const,
      }));
    }
  }

  private callMastraRerank = async <T>(
    query: string,
    items: T[],
    apiKey: string,
    model: string,
  ): Promise<{ result: T; score: number }[]> => {
    // Lazy import so test path doesn't pull @mastra/rag into the test bundle.
    const { rerank, CohereRelevanceScorer } = await import('@mastra/rag');
    const scorer = new CohereRelevanceScorer({ apiKey, model });
    const results = await rerank({
      query,
      results: items.map((item) => ({ result: item, score: 0 })),
      scorer,
    });
    return results;
  };
}
