import type { RerankedHit, Reranker } from './reranker.ts';
import type { RetrievalHit } from './types.ts';

export type LlmJudge = (input: {
  query: string;
  passages: string[];
}) => Promise<{ scores: number[] }>;

export interface LlmJudgeRerankerOptions {
  /** Override for tests; production wires this to @mastra/rag with MastraAgentRelevanceScorer. */
  judge?: LlmJudge;
}

/**
 * LLM-as-judge reranker. Sends the query + N passages to the configured model
 * and asks for a 0..1 relevance score per passage. Standard prompt; slower than
 * a real cross-encoder but doesn't require a Cohere key.
 *
 * Used as the production reranker when COHERE_API_KEY is absent, or as the
 * fallback when Cohere fails.
 */
export class LlmJudgeReranker implements Reranker {
  readonly providerId = 'llm-judge' as const;
  private readonly judge: LlmJudge;

  constructor(opts: LlmJudgeRerankerOptions = {}) {
    this.judge =
      opts.judge ??
      (async (_in) => {
        // No default scorer: throwing surfaces a misconfiguration early so callers inject explicitly.
        throw new Error('LlmJudgeReranker production judge not configured');
      });
  }

  async rescore<T>(
    query: string,
    hits: RetrievalHit<T>[],
    opts: { topN?: number } = {},
  ): Promise<RerankedHit<T>[]> {
    if (hits.length === 0) return [];

    try {
      // Score the FULL hit set so stage-1 oversampling is not wasted.
      const passages = hits.map((h) => JSON.stringify(h.item));
      const { scores } = await this.judge({ query, passages });
      if (scores.length !== hits.length) throw new Error('judge returned mismatched score count');

      // biome-ignore lint/style/noNonNullAssertion: scores.length === hits.length checked above
      const paired = hits.map((h, i) => ({ h, score: scores[i]! }));
      paired.sort((a, b) => b.score - a.score);

      // Truncate to topN AFTER scoring, then assign final ranks.
      const truncated = opts.topN != null ? paired.slice(0, opts.topN) : paired;
      return truncated.map((p, i) => ({
        ...p.h,
        rerankScore: p.score,
        rank: i + 1,
        reranker: 'llm-judge' as const,
      }));
    } catch {
      // Reranker contract: provider errors degrade to fallback hits, never throw into the calling tool.
      const truncated = opts.topN != null ? hits.slice(0, opts.topN) : hits;
      return truncated.map((h, i) => ({
        ...h,
        rerankScore: h.score,
        rank: i + 1,
        reranker: 'fallback' as const,
      }));
    }
  }
}
