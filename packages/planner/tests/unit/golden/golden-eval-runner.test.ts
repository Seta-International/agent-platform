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

it('captures question, answer, and trajectory on the case report for diagnostics', async () => {
  const report = await runGoldenEval({
    cases: [agentCase],
    suite: 'smoke',
    manifest,
    runAgent: async () => ({ answer: '8 open tasks', trajectory: goodTraj }),
    runRetrieval: async () => [],
  });
  const cr = report.cases[0]!;
  expect(cr.question).toBe('How many open tasks?');
  expect(cr.answer).toBe('8 open tasks');
  expect(cr.trajectory?.map((t) => t.toolName)).toEqual([
    'planner_queryTasksAgent',
    'planner_queryTasks',
  ]);
});

it('records advisory B* judge scores from runJudge without affecting the gate', async () => {
  const bCase = {
    ...agentCase,
    id: 'PQ-FAKE-B',
    metrics: { enabled: ['A1', 'B2'] },
  } as GoldenCase;

  const report = await runGoldenEval({
    cases: [bCase],
    suite: 'smoke',
    manifest,
    runAgent: async () => ({ answer: '8 open tasks', trajectory: goodTraj }),
    runRetrieval: async () => [],
    runJudge: async (_c, _out, metricIds) => {
      expect(metricIds).toEqual(['B2']);
      return {
        B2: [
          { id: 'faithfulness', score: 0.42, threshold: 0.8, passed: false, reason: 'ungrounded' },
        ],
      };
    },
  });

  // gate unaffected: A1 passes; the failing B2 is advisory only.
  expect(report.gateFailed).toBe(false);
  const b2 = report.cases[0]!.policies.find((p) => p.id === 'B2')!;
  expect(b2.mode).toBe('advisory');
  expect(b2.verdict).toBe('fail');
  expect(b2.scorers[0]!.id).toBe('faithfulness');
  expect(b2.scorers[0]!.detail).toContain('0.42');
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
