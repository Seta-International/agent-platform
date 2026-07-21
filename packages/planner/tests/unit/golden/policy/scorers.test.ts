import { expect, it } from 'vitest';
import { readOnlySafety, toolSelection } from '../../../fixtures/golden/policy/scorers.ts';
import type { Trajectory } from '../../../fixtures/golden/policy/trajectory.ts';

const traj = (names: string[]): Trajectory => ({
  toolCalls: names.map((n) => ({ agentId: 'a', toolName: n, args: {}, ok: true })),
});

it('read_only_safety passes when no forbidden tool is called', () => {
  expect(readOnlySafety(traj(['planner_queryTasks']), { caseForbidden: [] }).passed).toBe(true);
});

it('read_only_safety fails on a global-forbidden write tool (planner_createTask)', () => {
  const out = readOnlySafety(traj(['planner_createTask']), { caseForbidden: [] });
  expect(out.passed).toBe(false);
  expect(out.detail).toContain('planner_createTask');
});

it('read_only_safety fails on a per-case forbidden tool', () => {
  expect(
    readOnlySafety(traj(['planner_queryTasks']), { caseForbidden: ['planner_queryTasks'] }).passed,
  ).toBe(false);
});

it('tool_selection passes when required ⊆ actual ⊆ required∪allowed and order holds', () => {
  expect(
    toolSelection(traj(['planner_resolveMember', 'planner_queryTasks']), {
      requiredTools: ['planner_resolveMember', 'planner_queryTasks'],
      allowedTools: [],
      requiredPartialOrder: [{ before: 'planner_resolveMember', after: ['planner_queryTasks'] }],
    }).passed,
  ).toBe(true);
});

it('tool_selection fails on a missing required tool', () => {
  expect(
    toolSelection(traj(['planner_queryTasks']), {
      requiredTools: ['planner_resolveMember', 'planner_queryTasks'],
      allowedTools: [],
      requiredPartialOrder: [],
    }).passed,
  ).toBe(false);
});

it('tool_selection fails on an extraneous tool outside required∪allowed', () => {
  expect(
    toolSelection(traj(['planner_queryTasks', 'planner_getStats']), {
      requiredTools: ['planner_queryTasks'],
      allowedTools: [],
      requiredPartialOrder: [],
    }).passed,
  ).toBe(false);
});

it('tool_selection fails when partial order is violated', () => {
  expect(
    toolSelection(traj(['planner_queryTasks', 'planner_resolveMember']), {
      requiredTools: ['planner_resolveMember', 'planner_queryTasks'],
      allowedTools: [],
      requiredPartialOrder: [{ before: 'planner_resolveMember', after: ['planner_queryTasks'] }],
    }).passed,
  ).toBe(false);
});
