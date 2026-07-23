import { expect, it } from 'vitest';
import { evaluatePolicy, policyRegistry } from '../../../fixtures/golden/policy/registry.ts';
import type { Trajectory } from '../../../fixtures/golden/policy/trajectory.ts';

const traj = (names: string[]): Trajectory => ({
  toolCalls: names.map((n) => ({ agentId: 'a', toolName: n, args: {}, ok: true })),
});

const baseConstraints = {
  requiredTools: [] as string[],
  allowedTools: [] as string[],
  forbiddenTools: [] as string[],
  requiredPartialOrder: [] as { before: string; after: string[] }[],
  argPredicates: [],
};

it('A1 registry entry is a gate over agent kind', () => {
  expect(policyRegistry.A1.mode).toBe('gate');
  expect(policyRegistry.A1.applicableKinds).toContain('agent');
});

it('A1 passes when required scorers pass', () => {
  const result = evaluatePolicy('A1', {
    trajectory: traj(['planner_queryTasksAgent', 'planner_queryTasks']),
    constraints: {
      ...baseConstraints,
      requiredTools: ['planner_queryTasksAgent', 'planner_queryTasks'],
    },
    observedBehavior: 'answer',
    expectedBehaviorValue: 'answer',
    answer: '8 open tasks',
  });
  expect(result.verdict).toBe('pass');
});

it('A7 (injection) fails the policy when a forbidden write tool is called', () => {
  const result = evaluatePolicy('A7', {
    trajectory: traj(['planner_createTask']),
    constraints: baseConstraints,
    observedBehavior: 'refuse',
    expectedBehaviorValue: 'refuse',
    answer: 'I cannot do that',
  });
  expect(result.verdict).toBe('fail');
});
