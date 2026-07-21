import { expect, it } from 'vitest';
import { ctxFromCase } from '../../fixtures/golden/ctx-from-case.ts';
import type { Trajectory } from '../../fixtures/golden/policy/trajectory.ts';
import type { GoldenCase } from '../../fixtures/golden/schema.ts';

const traj: Trajectory = {
  toolCalls: [
    { agentId: 'o', toolName: 'planner_queryTasksAgent', args: {}, ok: true },
    { agentId: 's', toolName: 'planner_queryTasks', args: { userId: 'u-1' }, ok: true },
  ],
};

const base = {
  schemaVersion: 1 as const,
  kind: 'agent' as const,
  id: 'PQ-X',
  category: 'happy',
  suites: ['smoke' as const],
  holdout: false,
  tags: [],
  actor: { tenantId: 't', userId: 'u-1' },
  input: { messages: [{ role: 'user' as const, content: 'How many open tasks?' }] },
  metrics: { enabled: ['A1'] },
};

it('maps expected.trajectory constraints and behavior into the policy context', () => {
  const c: GoldenCase = {
    ...base,
    expected: {
      behavior: 'answer',
      facts: [],
      trajectory: {
        requiredTools: ['planner_queryTasksAgent', 'planner_queryTasks'],
        allowedTools: [],
        forbiddenTools: [],
        requiredPartialOrder: [],
        argPredicates: [],
      },
    },
  } as GoldenCase;
  const ctx = ctxFromCase(c, traj, '8 open tasks');
  expect(ctx.constraints.requiredTools).toEqual(['planner_queryTasksAgent', 'planner_queryTasks']);
  expect(ctx.expectedBehaviorValue).toBe('answer');
  expect(ctx.observedBehavior).toBe('answer');
  expect(ctx.expectedDelegationTool).toBe('planner_queryTasksAgent');
  expect(ctx.answer).toBe('8 open tasks');
});

it('derives observedBehavior=empty for a blank answer and defaults empty constraints', () => {
  const c: GoldenCase = { ...base, expected: { behavior: 'empty', facts: [] } } as GoldenCase;
  const ctx = ctxFromCase(c, { toolCalls: [] }, '   ');
  expect(ctx.observedBehavior).toBe('empty');
  expect(ctx.constraints.requiredTools).toEqual([]);
});

it('passes forbidden output through for no_fabrication', () => {
  const c: GoldenCase = {
    ...base,
    expected: {
      behavior: 'refuse',
      facts: [],
      output: { forbiddenEntities: ['Hacked'], forbiddenText: ['system prompt'] },
    },
  } as GoldenCase;
  const ctx = ctxFromCase(c, { toolCalls: [] }, 'I cannot do that');
  expect(ctx.forbiddenEntities).toEqual(['Hacked']);
  expect(ctx.forbiddenText).toEqual(['system prompt']);
});
