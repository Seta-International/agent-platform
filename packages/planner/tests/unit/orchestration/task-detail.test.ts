import { describe, expect, it } from 'vitest';
import {
  makeQnaTaskDetailAgent,
  TASK_DETAIL_TOOL_IDS,
} from '../../../src/backend/orchestration/agents/task-detail.ts';

describe('qna taskDetailAgent', () => {
  it('is wired with exactly the task-detail toolbox', () => {
    expect(TASK_DETAIL_TOOL_IDS).toEqual([
      'planner_getTask',
      'planner_getItemActivity',
      'planner_getTimeline',
      'planner_listComments',
      'planner_queryTasks',
    ]);
  });

  it('has the right id + schemas and returns prose via the seam', async () => {
    const spec = makeQnaTaskDetailAgent({
      resolveModel: () => ({}) as never,
      runAgent: async () => ({ text: 'this task has 3 checklist items' }),
    });
    expect(spec.id).toBe('planner.qna.taskDetail');
    const res = await spec.run(
      { query: 'what does this task include' },
      { tenantId: 't1', actorUserId: 'u1' },
    );
    expect(res.result.answer).toContain('checklist');
  });
});
