import type { SpecializedAgentSpec } from '@seta/agent-sdk';
import { EMPTY_TRUST } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineEvalCase } from '../../src/dataset.ts';
import { runSpecEvals } from '../../src/run-spec-evals.ts';
import { goldenMatchScorer, schemaConformanceScorer } from '../../src/scorers.ts';

const outputSchema = z.object({ a: z.string() });
const echo: SpecializedAgentSpec<{ q: string }, { a: string }> = {
  id: 'demo.echo',
  description: 'echo',
  inputSchema: z.object({ q: z.string() }),
  outputSchema,
  run: async (input, ctx) => {
    ctx.onEvent?.({ kind: 'text', text: input.q });
    return { result: { a: input.q }, trust: EMPTY_TRUST };
  },
};

describe('runSpecEvals', () => {
  it('passes when every gated scorer meets threshold', async () => {
    const res = await runSpecEvals({
      target: echo,
      data: [
        defineEvalCase({
          name: 'c1',
          layer: 'deterministic',
          input: { q: 'hi' },
          actor: { tenantId: 't1', userId: 'u1' },
          groundTruth: { a: 'hi' },
        }),
      ],
      scorers: [{ scorer: schemaConformanceScorer(outputSchema) }, { scorer: goldenMatchScorer() }],
    });
    expect(res.verdict).toBe('passed');
    expect(res.scores['schema-conformance']).toBe(1);
    expect(res.scores['golden-match']).toBe(1);
    expect(res.summary.totalCases).toBe(1);
  });

  it('fails the verdict when a gated scorer is below threshold', async () => {
    const res = await runSpecEvals({
      target: echo,
      data: [
        defineEvalCase({
          name: 'c1',
          layer: 'deterministic',
          input: { q: 'hi' },
          actor: { tenantId: 't1', userId: 'u1' },
          groundTruth: { a: 'WRONG' },
        }),
      ],
      scorers: [{ scorer: goldenMatchScorer(), gate: true }],
    });
    expect(res.verdict).toBe('failed');
  });

  it('does not fail the verdict for a non-gated scorer below threshold', async () => {
    const res = await runSpecEvals({
      target: echo,
      data: [
        defineEvalCase({
          name: 'c1',
          layer: 'deterministic',
          input: { q: 'hi' },
          actor: { tenantId: 't1', userId: 'u1' },
          groundTruth: { a: 'WRONG' },
        }),
      ],
      scorers: [{ scorer: goldenMatchScorer(), gate: false }],
    });
    expect(res.verdict).toBe('passed');
    expect(res.scores['golden-match']).toBe(0);
  });
});
