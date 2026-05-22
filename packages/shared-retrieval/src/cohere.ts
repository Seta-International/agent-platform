import type { RerankedHit, Reranker } from './reranker.ts';
import type { RetrievalHit } from './types.ts';

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
    if (hits.length === 0) return [];

    try {
      const fn = this.opts.rerankFn ?? this.callMastraRerank;
      // Score the FULL hit set so stage-1 oversampling is not wasted.
      const scored = await fn(
        query,
        hits.map((h) => h.item),
        this.opts.apiKey,
        this.opts.model,
      );

      // Map back to a RerankedHit preserving the original RetrievalHit fields.
      const byItem = new Map(hits.map((h) => [h.item, h]));
      const reranked = scored.map((s) => {
        const orig = byItem.get(s.result);
        if (!orig) throw new Error('reranker returned item not in input');
        return { ...orig, rerankScore: s.score, reranker: 'cohere' as const };
      });

      // Truncate to topN AFTER scoring, then assign final ranks.
      const truncated = callOpts.topN != null ? reranked.slice(0, callOpts.topN) : reranked;
      return truncated.map((h, i) => ({ ...h, rank: i + 1 }));
    } catch {
      // Reranker contract: provider errors degrade to fallback hits, never throw into the calling tool.
      const truncated = callOpts.topN != null ? hits.slice(0, callOpts.topN) : hits;
      return truncated.map((h, i) => ({
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
    // CohereRelevanceScorer(model, apiKey) — positional args in @mastra/rag@2.2.1.
    const { rerankWithScorer, CohereRelevanceScorer } = await import('@mastra/rag');
    const scorer = new CohereRelevanceScorer(model, apiKey);
    // @mastra/rag operates on QueryResult[] internally; we wrap our items as
    // unknown metadata and extract them back by id after scoring.
    // `text` is required so the cross-encoder has a string payload to score against;
    // `id` is the original index so we can map back correctly after reordering.
    const queryResults = items.map((item, i) => ({
      id: String(i),
      score: 0,
      metadata: { text: JSON.stringify(item), original: item as Record<string, unknown> },
    }));
    const results = await rerankWithScorer({
      results: queryResults,
      query,
      scorer,
      // topK must equal the full set so all candidates are scored and returned.
      options: { topK: queryResults.length },
    });
    return results.map((r) => {
      const originalIdx = Number(r.result.id);
      if (!Number.isFinite(originalIdx)) throw new Error(`corrupt rerank id: ${r.result.id}`);
      return { result: items[originalIdx] as T, score: r.score };
    });
  };
}
