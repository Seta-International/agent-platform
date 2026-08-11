import { describe, expect, it } from 'vitest';
import { makeActionTools } from '../../../../src/backend/orchestration/action/orchestrator.tools.ts';

describe('the A2 allowlist', () => {
  it('is exactly seven tools — three reads to locate, four writes', () => {
    const tools = makeActionTools({ ports: {} as never, ctx: {} as never });
    expect(Object.keys(tools).sort()).toEqual([
      'planner_assignTask',
      'planner_getTask',
      'planner_linkTasks',
      'planner_mergeTasks',
      'planner_queryTasks',
      'planner_resolveMember',
      'planner_updateTask',
    ]);
  });

  // Structural, not prompt-enforced: the delete tool is unreachable because it
  // is not here, and creating still is not A2's job on this branch.
  it('exposes no purge and no create tool', () => {
    const tools = makeActionTools({ ports: {} as never, ctx: {} as never });
    expect(Object.keys(tools)).not.toContain('planner_purgeTask');
    expect(Object.keys(tools)).not.toContain('planner_createTask');
  });
});
