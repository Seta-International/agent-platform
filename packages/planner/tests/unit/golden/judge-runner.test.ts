import { fakeJudgeModel } from '@seta/shared-agent-evals';
import { expect, it } from 'vitest';
import type { AgentRunOutput } from '../../fixtures/golden/golden-eval-runner.ts';
import { judgeContext, makeGoldenJudge } from '../../fixtures/golden/judge-runner.ts';
import type { GoldenCase } from '../../fixtures/golden/schema.ts';

const caseStub = { id: 'PQ-X', kind: 'agent' } as GoldenCase;

const output: AgentRunOutput = {
  answer: 'You have 8 open tasks.',
  trajectory: {
    toolCalls: [
      {
        agentId: 'planner.query.taskSearch',
        toolName: 'planner_queryTasks',
        args: {},
        result: { count: 8 },
        ok: true,
      },
      { agentId: 'o', toolName: 'planner_queryTasksAgent', args: {}, ok: true },
    ],
  },
};

it('judgeContext extracts tool results as grounding strings, skipping result-less calls', () => {
  const ctx = judgeContext(output);
  expect(ctx).toHaveLength(1);
  expect(ctx[0]).toContain('8');
});

it('scores wired B* metrics via the judge model and skips unwired ones', async () => {
  const judge = makeGoldenJudge({ model: fakeJudgeModel([0.9]) });
  const res = await judge(caseStub, output, ['B2', 'B4', 'B7']);

  expect(res.B2![0]!.id).toBe('faithfulness');
  expect(res.B2![0]!.threshold).toBe(0.8);
  expect(typeof res.B2![0]!.score).toBe('number');
  expect(res.B2![0]!.passed).toBe(res.B2![0]!.score >= 0.8);

  expect(res.B4![0]!.id).toBe('answer-relevancy');
  expect(res.B4![0]!.threshold).toBe(0.6);

  // B7 (tone/clarity) has no prebuilt judge yet → not scored.
  expect(res.B7).toBeUndefined();
});
