import { expect, it } from 'vitest';
import { runGoldenEval } from '../../fixtures/golden/golden-eval-runner.ts';
import type { Trajectory } from '../../fixtures/golden/policy/trajectory.ts';
import type { GoldenCase } from '../../fixtures/golden/schema.ts';

const agentCase: GoldenCase = {
  schemaVersion: 1,
  kind: 'agent',
  id: 'PQ-FAKE-1',
  category: 'happy',
  suites: ['smoke'],
  holdout: false,
  tags: [],
  actor: { tenantId: 't', userId: 'u-1' },
  input: { messages: [{ role: 'user', content: 'How many open tasks?' }] },
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
  metrics: { enabled: ['A1'] },
} as GoldenCase;

const goodTraj: Trajectory = {
  toolCalls: [
    { agentId: 'o', toolName: 'planner_queryTasksAgent', args: {}, ok: true },
    { agentId: 's', toolName: 'planner_queryTasks', args: {}, ok: true },
  ],
};

const manifest = {
  agentVersion: 'x',
  promptVersion: 'x',
  productionModelVersion: 'x',
  judgeModelVersion: 'n/a',
  harnessVersion: 'phase-2a',
};

it('scores an agent case data-driven via metrics.enabled and passes when policies pass', async () => {
  const report = await runGoldenEval({
    cases: [agentCase],
    suite: 'smoke',
    manifest,
    runAgent: async () => ({ answer: '8 open tasks', trajectory: goodTraj }),
    runRetrieval: async () => [],
  });
  expect(report.gateFailed).toBe(false);
  expect(report.cases[0]!.policies[0]!.id).toBe('A1');
  expect(report.cases[0]!.policies[0]!.mode).toBe('gate');
  expect(report.cases[0]!.policies[0]!.verdict).toBe('pass');
});

it('marks gateFailed when a gate policy fails (missing required tool)', async () => {
  const report = await runGoldenEval({
    cases: [agentCase],
    suite: 'smoke',
    manifest,
    runAgent: async () => ({
      answer: '8 open tasks',
      trajectory: {
        toolCalls: [{ agentId: 'o', toolName: 'planner_queryTasksAgent', args: {}, ok: true }],
      },
    }),
    runRetrieval: async () => [],
  });
  expect(report.gateFailed).toBe(true);
  expect(report.gateFailures[0]!.caseId).toBe('PQ-FAKE-1');
});

it('records verdict=error and fails the gate when the agent run throws', async () => {
  const report = await runGoldenEval({
    cases: [agentCase],
    suite: 'smoke',
    manifest,
    runAgent: async () => {
      throw new Error('model boom');
    },
    runRetrieval: async () => [],
  });
  expect(report.cases[0]!.policies[0]!.verdict).toBe('error');
  expect(report.gateFailed).toBe(true);
});
