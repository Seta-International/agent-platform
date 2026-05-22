import type { RetrievalHit } from './types.ts';

export interface RerankedHit<TItem> extends RetrievalHit<TItem> {
  /** Rerank score 0..1 from the cross-encoder, blended with stage-1 signals. */
  rerankScore: number;
  /** Which reranker actually scored this — surfaces in tool metadata. */
  reranker: 'cohere' | 'llm-judge' | 'noop' | 'fallback';
}

export interface Reranker {
  /** Identifier stored in tool result metadata so callers know the precision tier. */
  readonly providerId: 'cohere' | 'llm-judge' | 'noop';
  /**
   * Rerank a stage-1 hit set against the query. Returns a NEW array — input is
   * not mutated. Failure modes (provider down, rate limit) are the reranker's
   * own responsibility; the contract guarantees this method never throws into
   * the calling tool (it falls back internally or returns the input untouched).
   */
  rescore<T>(
    query: string,
    hits: RetrievalHit<T>[],
    opts?: { topN?: number },
  ): Promise<RerankedHit<T>[]>;
}
