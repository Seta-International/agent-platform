import { SpecializedAgentRegistry } from '@seta/agent-sdk';
import { ORCH_JOBS, OrchestrationRegistry } from '@seta/shared-orchestration';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  AvailabilityPort,
  SkillExtractorPort,
  SkillSearchPort,
  TaskReaderPort,
} from '../../../src/backend/orchestration/ports.ts';
import { buildStaffingOrchestrationRuntime } from '../../../src/backend/orchestration/register.ts';

const fakePorts = {
  taskReader: { load: async () => null } satisfies TaskReaderPort,
  skillExtractor: {
    extract: async () => ({ actionable: false, skills: [] }),
  } satisfies SkillExtractorPort,
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
  it('registers the four agents and the orchestration, and returns a runtime', () => {
    const rt = buildStaffingOrchestrationRuntime({ ports: fakePorts, repo: {} as never });
    SpecializedAgentRegistry.freeze();
    OrchestrationRegistry.freeze();

    expect(SpecializedAgentRegistry.get('staffing.analyzer')).toBeDefined();
    expect(SpecializedAgentRegistry.get('staffing.recommender')).toBeDefined();
    expect(OrchestrationRegistry.get('staffing.assigneeRecommendation')).toBeDefined();
    expect(typeof rt.runInline).toBe('function');
    expect(rt.taskList[ORCH_JOBS.RUN_STEP]).toBeDefined();
  });
});
