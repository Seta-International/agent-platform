import { describe, expect, it } from 'vitest';
import { makeQueryGeneralAnswerAgent } from '../../../src/backend/orchestration/agents/general-answer.ts';

describe('query generalAnswerAgent', () => {
  it('has the planner.qna.generalAnswer id and the shared query/answer schemas', () => {
    const spec = makeQueryGeneralAnswerAgent({
      resolveModel: () => ({}) as never,
      mastraStorage: {} as never,
    });
    expect(spec.id).toBe('planner.query.generalAnswer');
    expect(spec.inputSchema.safeParse({ query: 'hi' }).success).toBe(true);
    expect(spec.outputSchema.safeParse({ answer: 'hello' }).success).toBe(true);
  });

  it('returns the agent text as the answer via the runAgent seam', async () => {
    const spec = makeQueryGeneralAnswerAgent({
      resolveModel: () => ({}) as never,
      mastraStorage: {} as never,
      runAgent: async () => ({ text: 'a synthesized answer' }),
    });
    const res = await spec.run({ query: 'summarize' }, { tenantId: 't1', actorUserId: 'u1' });
    expect(res.result.answer).toBe('a synthesized answer');
    expect(res.trust.confidenceScore).toBeGreaterThan(0);
  });
});
