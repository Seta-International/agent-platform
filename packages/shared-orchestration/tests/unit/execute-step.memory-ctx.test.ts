import type {
  AgentMemoryHandle,
  SpecializedAgentRunCtx,
  SpecializedAgentSpec,
} from '@seta/agent-sdk';
import { EMPTY_TRUST } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { executeStep } from '../../src/execute-step.ts';
import type { RunRecord, RunStateRepository } from '../../src/repository.ts';
import type { OrchestrationSpec } from '../../src/types.ts';

function harness() {
  let captured: SpecializedAgentRunCtx | undefined;
  const agent: SpecializedAgentSpec = {
    id: 'a1',
    description: '',
    inputSchema: z.any(),
    outputSchema: z.any(),
    run: async (_input, ctx) => {
      captured = ctx;
      return { result: {}, trust: EMPTY_TRUST };
    },
  };
  const spec: OrchestrationSpec = {
    id: 'o1',
    steps: [{ id: 's1', agentId: 'a1', input: () => ({}) }],
    serializationKey: () => 'k',
    onComplete: async () => {},
  };
  const run: RunRecord = {
    status: 'running',
    input: {},
    state: { runId: 'r1', orchestrationId: 'o1', outputs: {} },
  };
  const repo = { saveStep: async () => {} } as unknown as RunStateRepository;
  return { agent, spec, run, repo, captured: () => captured };
}

describe('executeStep — memory handle plumbing', () => {
  it('forwards threadId, entitiesMemory and userMemory into the agent run ctx', async () => {
    const { agent, spec, run, repo, captured } = harness();
    const entitiesMemory = { memory: {}, memoryConfig: {} } as unknown as AgentMemoryHandle;
    const userMemory = { memory: {}, memoryConfig: {} } as unknown as AgentMemoryHandle;

    await executeStep(
      spec,
      run,
      0,
      { tenantId: 't1', actorUserId: 'u1', threadId: 'conv-1', entitiesMemory, userMemory },
      { repo, getAgent: () => agent },
    );

    expect(captured()?.threadId).toBe('conv-1');
    expect(captured()?.entitiesMemory).toBe(entitiesMemory);
    expect(captured()?.userMemory).toBe(userMemory);
  });

  it('leaves the fields undefined when the run ctx has none', async () => {
    const { agent, spec, run, repo, captured } = harness();

    await executeStep(
      spec,
      run,
      0,
      { tenantId: 't1', actorUserId: 'u1' },
      { repo, getAgent: () => agent },
    );

    expect(captured()?.threadId).toBeUndefined();
    expect(captured()?.entitiesMemory).toBeUndefined();
    expect(captured()?.userMemory).toBeUndefined();
  });
});
