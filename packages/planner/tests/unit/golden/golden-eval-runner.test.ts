import { expect, it } from 'vitest';
import { runGoldenEval } from '../../fixtures/golden/golden-eval-runner.ts';
import { ACTION_CONFIG_URL } from '../../fixtures/golden/metric-policy.ts';
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

// --- FUT-827: conversation cases ----------------------------------------------

const revisionCase = {
  schemaVersion: 1,
  kind: 'conversation',
  id: 'RV-008',
  suites: ['smoke'],
  holdout: false,
  tags: [],
  fixtures: [],
  actor: { tenantId: 't', userId: 'u' },
  turns: [
    { user: 'sang 15/8', expected: { behavior: 'confirm', facts: [], dbEffects: 'none' } },
    { user: 'À thôi 19/8', expected: { behavior: 'confirm', facts: [], dbEffects: 'none' } },
    {
      decision: { chosen: 'primary' },
      expected: {
        behavior: 'applied',
        facts: [],
        dbEffects: { rowsChanged: 1, after: [] },
      },
    },
  ],
  metrics: { enabled: ['M3'] },
} as never;

const noopSeams = {
  runAgent: async () => ({ answer: '', trajectory: { toolCalls: [] } }),
  runRetrieval: async () => [],
  manifest: {
    agentVersion: 'planner-action',
    promptVersion: 'a2-v1',
    productionModelVersion: 'mock',
    judgeModelVersion: 'mock',
    harnessVersion: 'a2',
  },
};

const suspendTurn = {
  answer: 'preview',
  trajectory: { toolCalls: [] },
  signals: { suspended: true },
  dbEffects: { expected: 'none', observed: { rowsChanged: 0, mismatches: [] } },
};
const appliedTurn = {
  answer: 'done',
  trajectory: { toolCalls: [] },
  signals: { applied: true },
  dbEffects: {
    expected: { rowsChanged: 1, after: [] },
    observed: { rowsChanged: 1, mismatches: [] },
  },
};

it('scores a conversation case turn by turn instead of skipping it', async () => {
  const report = await runGoldenEval({
    ...noopSeams,
    cases: [revisionCase],
    suite: 'smoke',
    metricConfigUrl: ACTION_CONFIG_URL,
    runConversation: async () => ({ turns: [suspendTurn, suspendTurn, appliedTurn] }) as never,
  });

  const m3 = report.cases[0]!.policies.find((p) => p.id === 'M3');
  expect(m3?.verdict).toBe('pass');
  // One scorer entry per turn, each naming its turn so a failure is locatable.
  expect(m3?.scorers.map((s) => s.id)).toEqual([
    'turn1:db_effects',
    'turn2:db_effects',
    'turn3:db_effects',
  ]);
  expect(report.gateFailures).toEqual([]);
});

it('fails the case when ONE turn wrote a row before Confirm', async () => {
  const wroteEarly = {
    ...suspendTurn,
    dbEffects: {
      expected: 'none',
      observed: { rowsChanged: 1, mismatches: [], changedKeys: ['planner.tasks:x'] },
    },
  };
  const report = await runGoldenEval({
    ...noopSeams,
    cases: [revisionCase],
    suite: 'smoke',
    metricConfigUrl: ACTION_CONFIG_URL,
    runConversation: async () => ({ turns: [wroteEarly, suspendTurn, appliedTurn] }) as never,
  });
  expect(report.cases[0]!.policies.find((p) => p.id === 'M3')?.verdict).toBe('fail');
  expect(report.gateFailures).toEqual([
    { caseId: 'RV-008', policyId: 'M3', scorer: 'turn1:db_effects' },
  ]);
});

it('records an error verdict when the conversation seam throws', async () => {
  const report = await runGoldenEval({
    ...noopSeams,
    cases: [revisionCase],
    suite: 'smoke',
    metricConfigUrl: ACTION_CONFIG_URL,
    runConversation: async () => {
      throw new Error('resume lost the run');
    },
  });
  expect(report.cases[0]!.policies[0]!.verdict).toBe('error');
  expect(report.gateFailures[0]!.scorer).toBe('run');
});

it('marks a conversation case skipped when no seam is supplied', async () => {
  const report = await runGoldenEval({ ...noopSeams, cases: [revisionCase], suite: 'smoke' });
  expect(report.cases[0]!.skipped).toBeTruthy();
  expect(report.gateFailures).toEqual([]);
});

it('records WHY a conversation run threw, so a dead model is not read as a dead agent', async () => {
  const report = await runGoldenEval({
    ...noopSeams,
    cases: [revisionCase],
    suite: 'smoke',
    metricConfigUrl: ACTION_CONFIG_URL,
    runConversation: async () => {
      throw new Error('Cannot connect to API: Connect Timeout Error');
    },
  });
  expect(report.cases[0]!.runError).toContain('Connect Timeout Error');
  expect(report.cases[0]!.policies.every((p) => p.verdict === 'error')).toBe(true);
});

// --- FUT-828: a turn that declares no trajectory asserts nothing about tools -------

// The decision turn of every happy case declares no `trajectory` — its assertion is
// the row count, because what Confirm does is write. `tool_selection` must therefore
// assert NOTHING there. It used to score every observed call against an EMPTY
// allowlist, so the first baseline run reported
// `turn2:tool_selection: extraneous tool(s): planner_createTask` against the case
// whose entire purpose is to call planner_createTask. Note the asymmetry that made
// this a bug rather than a policy: `trajectory_efficiency` on that same undeclared
// turn is deliberately vacuous (`maxToolCalls ?? MAX_SAFE_INTEGER`), so an absent
// trajectory already meant "asserts nothing" for one scorer and "forbids everything"
// for the other.
const applyCase = {
  schemaVersion: 1,
  kind: 'conversation',
  id: 'MU-FAKE-APPLY',
  suites: ['smoke'],
  holdout: false,
  tags: [],
  fixtures: [],
  actor: { tenantId: 't', userId: 'u' },
  turns: [
    {
      user: "tạo task 'Write release notes'",
      expected: {
        behavior: 'confirm',
        dbEffects: 'none',
        trajectory: { requiredTools: ['planner_createTask'], maxToolCalls: 3 },
      },
    },
    {
      decision: { chosen: 'primary' },
      expected: { behavior: 'applied', dbEffects: { rowsChanged: 1, after: [] } },
    },
  ],
  metrics: { enabled: ['M1'] },
} as never;

const createCall = {
  agentId: 'planner.action',
  toolName: 'planner_createTask',
  args: { title: 'Write release notes' },
  ok: true,
};

it('does not fail tool_selection on a decision turn that declares no trajectory', async () => {
  const report = await runGoldenEval({
    ...noopSeams,
    cases: [applyCase],
    suite: 'smoke',
    metricConfigUrl: ACTION_CONFIG_URL,
    runConversation: async () =>
      ({
        turns: [
          { ...suspendTurn, trajectory: { toolCalls: [createCall] } },
          { ...appliedTurn, trajectory: { toolCalls: [createCall] } },
        ],
      }) as never,
  });

  const m1 = report.cases[0]!.policies.find((p) => p.id === 'M1');
  const failed = m1?.scorers.filter((s) => !s.passed).map((s) => `${s.id}: ${s.detail}`);
  expect(failed, 'the applied turn asserts a row count, not a tool list').toEqual([]);
  expect(m1?.verdict).toBe('pass');
});

it('still forbids an undeclared tool on a turn that DID declare a trajectory', async () => {
  const report = await runGoldenEval({
    ...noopSeams,
    cases: [applyCase],
    suite: 'smoke',
    metricConfigUrl: ACTION_CONFIG_URL,
    runConversation: async () =>
      ({
        turns: [
          {
            ...suspendTurn,
            trajectory: {
              toolCalls: [
                createCall,
                { ...createCall, toolName: 'planner_deleteEverything', args: {} },
              ],
            },
          },
          { ...appliedTurn, trajectory: { toolCalls: [createCall] } },
        ],
      }) as never,
  });

  const m1 = report.cases[0]!.policies.find((p) => p.id === 'M1');
  expect(m1?.verdict).toBe('fail');
  expect(m1?.scorers.find((s) => s.id === 'turn1:tool_selection')?.detail).toContain(
    'planner_deleteEverything',
  );
});

it('keeps the turns a case DID complete when it broke mid-conversation', async () => {
  const report = await runGoldenEval({
    ...noopSeams,
    cases: [revisionCase],
    suite: 'smoke',
    metricConfigUrl: ACTION_CONFIG_URL,
    // Two turns ran; the third could not, because turn 1 never opened a card.
    runConversation: async () =>
      ({
        turns: [suspendTurn, suspendTurn],
        error: 'RV-008 decides with no open preview',
      }) as never,
  });
  const cr = report.cases[0]!;
  expect(cr.runError).toContain('no open preview');
  expect(cr.turns).toHaveLength(2);
  expect(cr.policies.every((p) => p.verdict === 'error')).toBe(true);
});
