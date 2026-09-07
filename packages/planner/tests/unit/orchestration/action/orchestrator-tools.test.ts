import { describe, expect, it } from 'vitest';
import { makeActionTools } from '../../../../src/backend/orchestration/action/orchestrator.tools.ts';

describe('the A2 allowlist', () => {
  it('is exactly eight tools — three reads to locate, five writes', () => {
    const tools = makeActionTools({ ports: {} as never, ctx: {} as never });
    expect(Object.keys(tools).sort()).toEqual([
      'planner_assignTask',
      'planner_createTask',
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
  // planner_createTask used to belong on this list. FUT-821 gives A2 the create
  // tool, so the only structurally unreachable one left is purge — which is the
  // point of the allowlist and must never be relaxed.
  it('still exposes no purge tool', () => {
    const tools = makeActionTools({ ports: {} as never, ctx: {} as never });
    expect(Object.keys(tools)).not.toContain('planner_purgeTask');
  });
});
