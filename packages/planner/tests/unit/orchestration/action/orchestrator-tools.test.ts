import { describe, expect, it } from 'vitest';
import { makeActionTools } from '../../../../src/backend/orchestration/action/orchestrator.tools.ts';

describe('the A2 allowlist', () => {
  it('is exactly four tools — two reads to locate, two writes', () => {
    const tools = makeActionTools({ ports: {} as never, ctx: {} as never });
    expect(Object.keys(tools).sort()).toEqual([
      'planner_getTask',
      'planner_linkTasks',
      'planner_queryTasks',
      'planner_updateTask',
    ]);
  });
});
