import type { AgentTool } from '@seta/agent-sdk';
import { SpecializedAgentRegistry } from '@seta/agent-sdk';
import { OrchestrationRegistry } from '@seta/shared-orchestration';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPlannerQueryRuntime } from '../../../src/backend/orchestration/register.ts';

const fakeFindSimilar = { id: 'planner_findSimilarTasks' } as unknown as AgentTool;

afterEach(() => {
  SpecializedAgentRegistry.__resetForTests();
  OrchestrationRegistry.__resetForTests();
});

describe('buildPlannerQueryRuntime', () => {
  it('registers the orchestrator in both registries', () => {
    buildPlannerQueryRuntime({
      resolveModel: () => ({}) as never,
      mastraStorage: {} as never,
      findSimilarTasksTool: fakeFindSimilar,
    });
    expect(SpecializedAgentRegistry.get('planner.query.orchestrator')).toBeDefined();
    expect(OrchestrationRegistry.get('planner.query.orchestrator')).toBeDefined();
  });

  it('runStream finalizes to the orchestrator answer (via the streamAgent seam)', async () => {
    const runtime = buildPlannerQueryRuntime({
      resolveModel: () => ({}) as never,
      mastraStorage: {} as never,
      findSimilarTasksTool: fakeFindSimilar,
      streamAgent: () => ({ text: Promise.resolve('You have 4 open tasks.') }),
    });
    const run = await runtime.runStream(
      { userText: 'what are my open tasks?', taskId: null },
      { tenantId: 't1', actorUserId: 'u1' },
    );
    const final = await run.finalize();
    expect((final.result as { answer: string }).answer).toBe('You have 4 open tasks.');
  });
});
