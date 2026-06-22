import type { AgentTool } from '@seta/agent-sdk';
import { SpecializedAgentRegistry } from '@seta/agent-sdk';
import { OrchestrationRegistry } from '@seta/shared-orchestration';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPlannerQnaRuntime } from '../../../src/backend/orchestration/register.ts';

const fakeFindSimilar = { id: 'planner_findSimilarTasks' } as unknown as AgentTool;

afterEach(() => {
  SpecializedAgentRegistry.__resetForTests();
  OrchestrationRegistry.__resetForTests();
});

describe('buildPlannerQnaRuntime', () => {
  it('registers the orchestrator in both registries', () => {
    buildPlannerQnaRuntime({
      resolveModel: () => ({}) as never,
      findSimilarTasksTool: fakeFindSimilar,
    });
    expect(SpecializedAgentRegistry.get('planner.qna.orchestrator')).toBeDefined();
    expect(OrchestrationRegistry.get('planner.qna.orchestrator')).toBeDefined();
  });

  it('runStream finalizes to the orchestrator answer (via the streamAgent seam)', async () => {
    const runtime = buildPlannerQnaRuntime({
      resolveModel: () => ({}) as never,
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
