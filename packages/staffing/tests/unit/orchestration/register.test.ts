import { SpecializedAgentRegistry } from '@seta/agent-sdk';
import { ORCH_JOBS, OrchestrationRegistry } from '@seta/shared-orchestration';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  AvailabilityPort,
  SkillSearchPort,
  TaskReaderPort,
  TaskSearchPort,
} from '../../../src/backend/orchestration/ports.ts';
import { buildStaffingOrchestrationRuntime } from '../../../src/backend/orchestration/register.ts';

const fakePorts = {
  taskReader: { load: async () => null } satisfies TaskReaderPort,
  taskSearch: {
    bySkillTags: async () => [],
    listAvailableTags: async () => [],
  } satisfies TaskSearchPort,
  skillSearch: { search: async () => [] } satisfies SkillSearchPort,
  availability: {
    status: async () => ({ status: 'available' as const, note: null }),
    inProgressCount: async () => 0,
  } satisfies AvailabilityPort,
};

afterEach(() => {
  SpecializedAgentRegistry.__resetForTests();
  OrchestrationRegistry.__resetForTests();
});

describe('buildStaffingOrchestrationRuntime', () => {
  it('registers the orchestrator agent + spec and returns a runtime', () => {
    const rt = buildStaffingOrchestrationRuntime({
      ports: fakePorts,
      resolveModel: () => ({}) as never,
      repo: {} as never,
    });
    SpecializedAgentRegistry.freeze();
    OrchestrationRegistry.freeze();

    expect(SpecializedAgentRegistry.get('staffing.orchestrator')).toBeDefined();
    expect(OrchestrationRegistry.get('staffing.orchestrator')).toBeDefined();
    expect(SpecializedAgentRegistry.get('staffing.analyzer')).toBeUndefined();
    expect(OrchestrationRegistry.get('staffing.assigneeRecommendation')).toBeUndefined();
    expect(typeof rt.runInline).toBe('function');
    expect(rt.taskList[ORCH_JOBS.RUN_STEP]).toBeDefined();
  });
});
