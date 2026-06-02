import { describe, expect, it } from 'vitest';
import { orchestratorSpec } from '../../../src/backend/orchestration/orchestrator-spec.ts';

describe('orchestratorSpec', () => {
  it('is a single step that feeds the run input straight to the orchestrator', () => {
    expect(orchestratorSpec.id).toBe('staffing.orchestrator');
    expect(orchestratorSpec.steps).toHaveLength(1);
    const step = orchestratorSpec.steps[0]!;
    expect(step.agentId).toBe('staffing.orchestrator');
    const runIn = { userText: 'hi', taskId: null };
    expect(step.input({ runId: 'r', orchestrationId: 'o', outputs: {} }, runIn)).toEqual(runIn);
  });

  it('serializes per tenant', () => {
    expect(orchestratorSpec.serializationKey(null, { tenantId: 't1', actorUserId: 'a' })).toBe(
      'staffing:orch:t1',
    );
  });
});
