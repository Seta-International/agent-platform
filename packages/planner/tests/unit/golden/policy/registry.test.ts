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
  // These cases mean their tool lists to be enforced, so they declare a trajectory.
  trajectoryDeclared: true,
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

// --- FUT-825: the nine A2 metrics --------------------------------------------

const baseCtx = {
  trajectory: { toolCalls: [] },
  constraints: {
    requiredTools: [],
    allowedTools: [],
    forbiddenTools: [],
    requiredPartialOrder: [],
    argPredicates: [],
    trajectoryDeclared: true,
  },
  observedBehavior: 'confirm',
  expectedBehaviorValue: 'confirm',
  answer: '',
};

it('registers the nine A2 metrics, all conversation-kind', () => {
  for (const id of ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9'] as const) {
    expect(policyRegistry[id].applicableKinds).toContain('conversation');
    expect(policyRegistry[id].defaultScorers.length).toBeGreaterThan(0);
  }
});

it('M3 fails when a row changed before Confirm', () => {
  const result = evaluatePolicy('M3', {
    ...baseCtx,
    dbEffects: { expected: 'none', observed: { rowsChanged: 1, mismatches: [] } },
  });
  expect(result.verdict).toBe('fail');
});

it('M3 passes when nothing was written', () => {
  const result = evaluatePolicy('M3', {
    ...baseCtx,
    dbEffects: { expected: 'none', observed: { rowsChanged: 0, mismatches: [] } },
  });
  expect(result.verdict).toBe('pass');
});

it('M1 enforces maxToolCalls — a model that splits one request into two fails', () => {
  const twoCalls = {
    toolCalls: [
      { agentId: 'planner.action', toolName: 'planner_updateTask', args: {}, ok: true },
      { agentId: 'planner.action', toolName: 'planner_updateTask', args: {}, ok: true },
    ],
  };
  const result = evaluatePolicy('M1', {
    ...baseCtx,
    trajectory: twoCalls,
    constraints: {
      ...baseCtx.constraints,
      requiredTools: ['planner_updateTask'],
      maxToolCalls: 1,
    },
  });
  expect(result.verdict).toBe('fail');
  expect(result.scorers.find((s) => s.id === 'trajectory_efficiency')?.outcome.passed).toBe(false);
});
