import type { SpecializedAgentSpec } from '@seta/agent-sdk';
import { EMPTY_TRUST } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineEvalCase, defineEvalSuite } from '../../src/dataset.ts';

const spec: SpecializedAgentSpec<{ q: string }, { a: string }> = {
  id: 'demo.echo',
  description: 'echo',
  inputSchema: z.object({ q: z.string() }),
  outputSchema: z.object({ a: z.string() }),
  run: async (input) => ({ result: { a: input.q }, trust: EMPTY_TRUST }),
};

describe('dataset quality extensions', () => {
  it('EvalCase carries per-case toolMocks', () => {
    const c = defineEvalCase({
      name: 'q1',
      layer: 'quality',
      input: { q: 'hi' },
      actor: { tenantId: 't1', userId: 'u1' },
      toolMocks: [{ toolId: 'demo_lookup', respond: () => ({ rows: [] }) }],
    });
    expect(c.toolMocks?.[0]?.toolId).toBe('demo_lookup');
  });

  it('EvalSuite exposes a buildQualitySpec', () => {
    const suite = defineEvalSuite({
      specId: 'demo.echo',
      buildSpec: () => spec,
      buildQualitySpec: () => spec,
      cases: [],
    });
    expect(suite.buildQualitySpec?.([])?.id).toBe('demo.echo');
  });
});
