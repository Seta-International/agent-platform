import { SpecializedAgentRegistry } from '@seta/agent-sdk';
import { OrchestrationRegistry } from '@seta/shared-orchestration';
import { afterEach, describe, expect, it } from 'vitest';
import { buildWeeklyPlanRuntime } from '../../../src/backend/orchestration/weekly-plan/register.ts';

afterEach(() => {
  SpecializedAgentRegistry.__resetForTests();
  OrchestrationRegistry.__resetForTests();
});

describe('buildWeeklyPlanRuntime', () => {
  it('registers the orchestrator in both registries', () => {
    buildWeeklyPlanRuntime({ resolveModel: () => ({}) as never });
    expect(SpecializedAgentRegistry.get('planner.weeklyPlan.orchestrator')).toBeDefined();
    expect(OrchestrationRegistry.get('planner.weeklyPlan.orchestrator')).toBeDefined();
  });

  it('runStream finalizes to the orchestrator answer (via the streamAgent seam)', async () => {
    const runtime = buildWeeklyPlanRuntime({
      resolveModel: () => ({}) as never,
      streamAgent: () => ({ text: Promise.resolve('### Wednesday\n- Review intern plan') }),
    });
    const run = await runtime.runStream(
      { userText: 'plan my week', taskId: null },
      { tenantId: 't1', actorUserId: 'u1' },
    );
    const final = await run.finalize();
    expect((final.result as { answer: string }).answer).toContain('Wednesday');
  });
});
