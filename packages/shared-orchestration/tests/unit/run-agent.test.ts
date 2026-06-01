import { EMPTY_TRUST, type SpecializedAgentSpec } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runAgent } from '../../src/run-agent.ts';

const incAgent: SpecializedAgentSpec<{ x: number }, { y: number }> = {
  id: 'inc',
  description: 'inc',
  inputSchema: z.object({ x: z.number() }),
  outputSchema: z.object({ y: z.number() }),
  run: async (input) => ({
    result: { y: input.x + 1 },
    trust: { ...EMPTY_TRUST, confidenceScore: 0.9 },
  }),
};

const getAgent = (id: string) => (id === 'inc' ? (incAgent as SpecializedAgentSpec) : undefined);

describe('runAgent (direct mode)', () => {
  it('runs an agent and returns result + trust without a queue', async () => {
    const res = await runAgent(
      'inc',
      { x: 4 },
      { tenantId: 't1', actorUserId: 'u1' },
      { getAgent },
    );
    expect(res.result).toEqual({ y: 5 });
    expect(res.trust.confidenceScore).toBe(0.9);
  });

  it('throws for an unknown agent', async () => {
    await expect(
      runAgent('ghost', {}, { tenantId: 't1', actorUserId: 'u1' }, { getAgent }),
    ).rejects.toThrow();
  });

  it('rejects input that violates the agent input schema', async () => {
    await expect(
      runAgent('inc', { x: 'no' }, { tenantId: 't1', actorUserId: 'u1' }, { getAgent }),
    ).rejects.toThrow();
  });
});
