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

describe('dataset builders', () => {
  it('defineEvalCase returns the case verbatim', () => {
    const c = defineEvalCase({
      name: 'basic',
      layer: 'deterministic',
      input: { q: 'hi' },
      actor: { tenantId: 't1', userId: 'u1' },
    });
    expect(c.name).toBe('basic');
    expect(c.layer).toBe('deterministic');
  });

  it('defineEvalSuite carries specId + a spec factory', () => {
    const suite = defineEvalSuite({
      specId: 'demo.echo',
      buildSpec: () => spec,
      cases: [
        defineEvalCase({
          name: 'basic',
          layer: 'deterministic',
          input: { q: 'hi' },
          actor: { tenantId: 't1', userId: 'u1' },
        }),
      ],
    });
    expect(suite.specId).toBe('demo.echo');
    expect(suite.buildSpec().id).toBe('demo.echo');
    expect(suite.cases).toHaveLength(1);
  });
});
