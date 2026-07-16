import type { AgentTool } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import {
  makeQueryTaskSearchAgent,
  TASK_SEARCH_TOOL_IDS,
} from '../../../src/backend/orchestration/agents/task-search.ts';

// A stand-in for the injected find-similar tool; never executed in this unit test.
const fakeFindSimilar = { id: 'planner_findSimilarTasks' } as unknown as AgentTool;

describe('query taskSearchAgent', () => {
  it('is wired with the discovery toolbox', () => {
    expect(TASK_SEARCH_TOOL_IDS).toEqual([
      'planner_queryTasks',
      'planner_findSimilarTasks',
      'planner_getBoardSnapshot',
      'planner_getStats',
      'planner_getOpenTaskCountForUser',
      'planner_resolveMember',
    ]);
  });

  it('has the right id + returns prose via the seam', async () => {
    const spec = makeQueryTaskSearchAgent({
      resolveModel: () => ({}) as never,
      findSimilarTasksTool: fakeFindSimilar,
      runAgent: async () => ({ text: 'You have 4 open tasks.' }),
    });
    expect(spec.id).toBe('planner.query.taskSearch');
    const res = await spec.run({ query: 'my open tasks' }, { tenantId: 't1', actorUserId: 'u1' });
    expect(res.result.answer).toContain('open tasks');
  });
});
