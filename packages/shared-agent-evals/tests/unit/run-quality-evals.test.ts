import type { MastraModelConfig } from '@mastra/core/llm';
import type { AgentTool, SpecializedAgentSpec } from '@seta/agent-sdk';
import { EMPTY_TRUST } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineEvalCase, defineEvalSuite } from '../../src/dataset.ts';
import { fakeJudgeModel } from '../../src/judge.ts';
import { answerRelevancyScorer } from '../../src/judge-scorers.ts';
import { runQualityEvals } from '../../src/run-quality-evals.ts';

// A spec that echoes the query into `answer` and records whether ctx.model was set.
let sawModel = false;
const echo: SpecializedAgentSpec<{ query: string }, { answer: string }> = {
  id: 'demo.echo',
  description: 'echo',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ answer: z.string() }),
  run: async (input, ctx) => {
    sawModel = ctx.model !== undefined;
    return { result: { answer: `re: ${input.query}` }, trust: EMPTY_TRUST };
  },
};

const suite = defineEvalSuite({
  specId: 'demo.echo',
  buildSpec: () => echo,
  buildQualitySpec: () => echo,
  cases: [
    defineEvalCase({
      name: 'quality-1',
      layer: 'quality',
      input: { query: 'hi' },
      actor: { tenantId: 't1', userId: 'u1' },
    }),
    defineEvalCase({
      name: 'ignored-deterministic',
      layer: 'deterministic',
      input: { query: 'nope' },
      actor: { tenantId: 't1', userId: 'u1' },
    }),
  ],
});

describe('runQualityEvals', () => {
  it('runs only quality cases, sets ctx.model, and scores with the judge', async () => {
    const res = await runQualityEvals({
      suite,
      genModel: { fake: true } as unknown as MastraModelConfig,
      scorers: [{ scorer: answerRelevancyScorer({ model: fakeJudgeModel([1]) }) }],
    });
    expect(res.specId).toBe('demo.echo');
    expect(res.totalCases).toBe(1); // deterministic case skipped
    expect(sawModel).toBe(true); // ctx.model was threaded
    expect(res.scores['answer-relevancy']).toBeGreaterThanOrEqual(0);
  });

  it('routes per-case toolMocks into buildQualitySpec as built AgentTools', async () => {
    let capturedMocks: AgentTool[] | undefined;
    const specWithToolCapture: SpecializedAgentSpec<{ query: string }, { answer: string }> = {
      id: 'demo.tool-echo',
      description: 'echo with tools',
      inputSchema: z.object({ query: z.string() }),
      outputSchema: z.object({ answer: z.string() }),
      run: async (input) => ({ result: { answer: `re: ${input.query}` }, trust: EMPTY_TRUST }),
    };

    const toolSuite = defineEvalSuite({
      specId: 'demo.tool-echo',
      buildSpec: () => specWithToolCapture,
      buildQualitySpec: (mocks) => {
        capturedMocks = mocks;
        return specWithToolCapture;
      },
      cases: [
        defineEvalCase({
          name: 'quality-with-tool',
          layer: 'quality',
          input: { query: 'hi' },
          actor: { tenantId: 't1', userId: 'u1' },
          toolMocks: [{ toolId: 'demo_lookup', respond: () => ({ rows: [] }) }],
        }),
      ],
    });

    await runQualityEvals({
      suite: toolSuite,
      genModel: { fake: true } as unknown as MastraModelConfig,
      scorers: [{ scorer: answerRelevancyScorer({ model: fakeJudgeModel([1]) }) }],
    });

    expect(capturedMocks).toHaveLength(1);
    // AgentTool wraps a Mastra tool; its id must match the mocked tool id
    // (same cast pattern as tests/unit/tool-mock.test.ts).
    expect((capturedMocks?.[0] as { id: string } | undefined)?.id).toBe('demo_lookup');
  });

  it('returns an empty result when the suite has no buildQualitySpec', async () => {
    const noQualitySuite = defineEvalSuite({
      specId: 'demo.no-quality',
      buildSpec: () => echo,
      cases: [
        defineEvalCase({
          name: 'quality-1',
          layer: 'quality',
          input: { query: 'hi' },
          actor: { tenantId: 't1', userId: 'u1' },
        }),
      ],
    });

    const res = await runQualityEvals({
      suite: noQualitySuite,
      genModel: { fake: true } as unknown as MastraModelConfig,
      scorers: [{ scorer: answerRelevancyScorer({ model: fakeJudgeModel([1]) }) }],
    });

    expect(res).toEqual({ specId: 'demo.no-quality', scores: {}, cases: [], totalCases: 0 });
  });
});
