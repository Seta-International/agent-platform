import type { AgentResult } from '@seta/agent-sdk';
import { EMPTY_TRUST } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { fakeJudgeModel } from '../../src/judge.ts';
import {
  answerRelevancyScorer,
  faithfulnessScorer,
  hallucinationScorer,
  toxicityScorer,
} from '../../src/judge-scorers.ts';

const output: AgentResult<{ answer: string }> = {
  result: { answer: 'You have 3 open tasks due this week.' },
  trust: EMPTY_TRUST,
};

describe('judge scorers (fake judge)', () => {
  it('answer-relevancy yields a numeric score in [0,1]', async () => {
    const s = answerRelevancyScorer({ model: fakeJudgeModel([1]) });
    expect(s.id).toBe('answer-relevancy');
    const run = await s.run({
      input: { query: 'how many open tasks do I have?' } as never,
      output: output as never,
    });
    const score = (run as { score: number }).score;
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('faithfulness yields a numeric score in [0,1]', async () => {
    const s = faithfulnessScorer({ model: fakeJudgeModel([1]) });
    expect(s.id).toBe('faithfulness');
    const run = await s.run({
      input: { query: 'how many open tasks do I have?' } as never,
      output: output as never,
      groundTruth: 'The user has 3 open tasks due this week.' as never,
    });
    const score = (run as { score: number }).score;
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('hallucination yields a numeric score in [0,1]', async () => {
    const s = hallucinationScorer({ model: fakeJudgeModel([1]) });
    expect(s.id).toBe('hallucination');
    const run = await s.run({
      input: { query: 'how many open tasks do I have?' } as never,
      output: output as never,
      groundTruth: 'The user has 3 open tasks due this week.' as never,
    });
    const score = (run as { score: number }).score;
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('toxicity scorer exposes a stable id', () => {
    expect(toxicityScorer({ model: fakeJudgeModel([0]) }).id).toBe('toxicity');
  });

  it('every shipped scorer exposes its stable id', () => {
    expect(answerRelevancyScorer({ model: fakeJudgeModel([1]) }).id).toBe('answer-relevancy');
    expect(faithfulnessScorer({ model: fakeJudgeModel([1]) }).id).toBe('faithfulness');
    expect(hallucinationScorer({ model: fakeJudgeModel([1]) }).id).toBe('hallucination');
    expect(toxicityScorer({ model: fakeJudgeModel([1]) }).id).toBe('toxicity');
  });
});
