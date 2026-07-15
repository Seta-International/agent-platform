import type { AgentResult } from '@seta/agent-sdk';
import { EMPTY_TRUST } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { fakeJudgeModel } from '../../src/judge.ts';
import { answerRelevancyScorer, toxicityScorer } from '../../src/judge-scorers.ts';

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

  it('toxicity scorer exposes a stable id', () => {
    expect(toxicityScorer({ model: fakeJudgeModel([0]) }).id).toBe('toxicity');
  });
});
