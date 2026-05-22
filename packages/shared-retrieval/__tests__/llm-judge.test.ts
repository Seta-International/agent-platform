import { describe, expect, it, vi } from 'vitest';
import { LlmJudgeReranker } from '../src/llm-judge.ts';

describe('LlmJudgeReranker', () => {
  it('asks the LLM to score each item and returns descending', async () => {
    const judge = vi.fn(async () => ({ scores: [0.2, 0.9, 0.5] }));
    const r = new LlmJudgeReranker({ judge: judge as never });

    const hits = [1, 2, 3].map((i) => ({
      item: { id: String(i) },
      score: 0.5,
      rank: i,
      source: 'hybrid' as const,
    }));
    const out = await r.rescore('q', hits);

    expect(out.map((h) => h.item.id)).toEqual(['2', '3', '1']); // 0.9, 0.5, 0.2
    expect(out[0]?.rerankScore).toBe(0.9);
    expect(out[0]?.reranker).toBe('llm-judge');
  });

  it('falls back to stage-1 order when judge throws', async () => {
    const judge = vi.fn(async () => {
      throw new Error('boom');
    });
    const r = new LlmJudgeReranker({ judge: judge as never });

    const hits = [{ item: { id: 'a' }, score: 0.5, rank: 1, source: 'hybrid' as const }];
    const out = await r.rescore('q', hits);

    expect(out[0]?.item.id).toBe('a');
    expect(out[0]?.reranker).toBe('fallback');
  });

  it('scores the full hit set before truncating to topN (Bug 4 fix)', async () => {
    let capturedPassageCount = 0;
    const judge = vi.fn(async ({ passages }: { passages: string[] }) => {
      capturedPassageCount = passages.length;
      return { scores: passages.map((_, i) => 1 - i / 100) };
    });
    const r = new LlmJudgeReranker({ judge: judge as never });

    const hits = Array.from({ length: 50 }, (_, i) => ({
      item: { id: String(i) },
      score: 1 / (i + 1),
      rank: i + 1,
      source: 'hybrid' as const,
    }));

    const out = await r.rescore('q', hits, { topN: 10 });

    // The judge must have received all 50 passages, not just 10.
    expect(capturedPassageCount).toBe(50);
    // The result must be truncated to topN after scoring.
    expect(out).toHaveLength(10);
  });
});
