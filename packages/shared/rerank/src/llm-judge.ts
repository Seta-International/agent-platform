import type { RetrievalHit } from '@seta/shared-retrieval';
import type { RerankedHit, Reranker } from './reranker.ts';

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
        // Lazy import — wire to @mastra/rag's MastraAgentRelevanceScorer in production
        // (the exact wire-up depends on your Mastra agent config and is out of scope
        // for this slice's unit tests).
        throw new Error('LlmJudgeReranker production judge not configured');
      });
  }

  async rescore<T>(
    query: string,
    hits: RetrievalHit<T>[],
    opts: { topN?: number } = {},
  ): Promise<RerankedHit<T>[]> {
    const sliced = opts.topN != null ? hits.slice(0, opts.topN) : hits;
    if (sliced.length === 0) return [];

    try {
      const passages = sliced.map((h) => JSON.stringify(h.item));
      const { scores } = await this.judge({ query, passages });
      if (scores.length !== sliced.length) throw new Error('judge returned mismatched score count');

      const paired = sliced.map((h, i) => ({ h, score: scores[i]! }));
      paired.sort((a, b) => b.score - a.score);

      return paired.map((p, i) => ({
        ...p.h,
        rerankScore: p.score,
        rank: i + 1,
        reranker: 'llm-judge' as const,
      }));
    } catch {
      return sliced.map((h, i) => ({
        ...h,
        rerankScore: h.score,
        rank: i + 1,
        reranker: 'fallback' as const,
      }));
    }
  }
}
