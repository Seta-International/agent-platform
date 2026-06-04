import type { SpecializedAgentRunCtx, SpecializedAgentSpec } from '@seta/agent-sdk';
import { EMPTY_TRUST } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { executeStep } from '../../src/execute-step.ts';
import type { RunRecord, RunStateRepository } from '../../src/repository.ts';
import type { OrchestrationSpec } from '../../src/types.ts';

describe('executeStep — HITL recorder plumbing', () => {
  it('forwards ctx.recordHitlApproval into the agent run ctx', async () => {
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
    const recordHitlApproval = async () => ({ runId: 'wr1', approvalId: 'ap1' });

    await executeStep(
      spec,
      run,
      0,
      { tenantId: 't1', actorUserId: 'u1', recordHitlApproval },
      { repo, getAgent: () => agent },
    );

    expect(captured?.recordHitlApproval).toBe(recordHitlApproval);
  });

  it('leaves recordHitlApproval undefined when the run ctx has none', async () => {
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

    await executeStep(
      spec,
      run,
      0,
      { tenantId: 't1', actorUserId: 'u1' },
      { repo, getAgent: () => agent },
    );

    expect(captured?.recordHitlApproval).toBeUndefined();
  });
});
