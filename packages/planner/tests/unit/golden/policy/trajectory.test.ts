import { expect, it } from 'vitest';
import { type Trajectory, toolNames } from '../../../fixtures/golden/policy/trajectory.ts';

const t: Trajectory = {
  toolCalls: [
    {
      agentId: 'planner-query',
      toolName: 'planner_resolveMember',
      args: { name: 'Tuan' },
      result: { userId: 'u-1' },
      ok: true,
    },
    {
      agentId: 'planner-query',
      toolName: 'planner_queryTasks',
      args: { userId: 'u-1' },
      result: [],
      ok: true,
    },
  ],
};

it('lists tool names in call order', () => {
  expect(toolNames(t)).toEqual(['planner_resolveMember', 'planner_queryTasks']);
});
