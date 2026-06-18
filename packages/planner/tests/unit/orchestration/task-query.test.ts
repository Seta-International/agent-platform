import type { AgentTool } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import {
  makeQnaTaskQueryAgent,
  TASK_QUERY_TOOL_IDS,
} from '../../../src/backend/orchestration/agents/task-query.ts';

// A stand-in for the injected find-similar tool; never executed in this unit test.
const fakeFindSimilar = { id: 'planner_findSimilarTasks' } as unknown as AgentTool;

describe('qna taskQueryAgent', () => {
  it('is wired with the discovery toolbox', () => {
    expect(TASK_QUERY_TOOL_IDS).toEqual([
      'planner_queryTasks',
      'planner_findSimilarTasks',
      'planner_getOpenTaskCountForUser',
    ]);
  });

  it('has the right id + returns prose via the seam', async () => {
    const spec = makeQnaTaskQueryAgent({
      resolveModel: () => ({}) as never,
      findSimilarTasksTool: fakeFindSimilar,
      runAgent: async () => ({ text: 'You have 4 open tasks.' }),
    });
    expect(spec.id).toBe('planner.qna.taskQuery');
    const res = await spec.run({ query: 'my open tasks' }, { tenantId: 't1', actorUserId: 'u1' });
    expect(res.result.answer).toContain('open tasks');
  });
});
