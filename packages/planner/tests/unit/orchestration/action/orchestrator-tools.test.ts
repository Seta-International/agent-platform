import { describe, expect, it } from 'vitest';
import { makeActionTools } from '../../../../src/backend/orchestration/action/orchestrator.tools.ts';

describe('the A2 allowlist', () => {
  it('is exactly five tools — two reads to locate, three writes', () => {
    const tools = makeActionTools({ ports: {} as never, ctx: {} as never });
    expect(Object.keys(tools).sort()).toEqual([
      'planner_getTask',
      'planner_linkTasks',
      'planner_mergeTasks',
      'planner_queryTasks',
      'planner_updateTask',
    ]);
  });

  // purgeTask is unreachable because it is not here — not because a prompt line
  // forbids it. That is the property this assertion protects.
  it('exposes no purge or create tool', () => {
    const tools = makeActionTools({ ports: {} as never, ctx: {} as never });
    expect(Object.keys(tools)).not.toContain('planner_purgeTask');
    expect(Object.keys(tools)).not.toContain('planner_createTask');
  });
});
