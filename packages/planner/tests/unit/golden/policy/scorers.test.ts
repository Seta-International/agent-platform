import { expect, it } from 'vitest';
import { readOnlySafety } from '../../../fixtures/golden/policy/scorers.ts';
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
