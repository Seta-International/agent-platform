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

it('records verdict=error and an INFRA entry when the agent run throws', async () => {
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
  // FUT-829: this used to set `gateFailed`. A run that threw produced no evidence
  // about the agent, so gating on it reported an infrastructure incident as a
  // model defect — and, worse, silently: the rate simply came out lower.
  expect(report.gateFailed).toBe(false);
  expect(report.infraErrors).toEqual([{ caseId: 'PQ-FAKE-1', reason: 'model boom' }]);
  expect(report.cases[0]!.infraError).toBe('model boom');
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
  // FUT-829: an unscoreable case is an INFRA incident, not a gate failure. It used
  // to be filed as `scorer: 'run'`, which made a dead seam indistinguishable from a
  // model that chose the wrong tool.
  expect(report.gateFailures).toEqual([]);
  expect(report.infraErrors?.[0]?.reason).toBe('resume lost the run');
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

// --- FUT-828: reading to resolve a reference is not an extraneous tool ------------

// No case in the corpus declares `allowedTools` — 28 `requiredTools` declarations
// across happy/injection/revision and not one allowlist — because resolving "Deploy
// API" or "Tuấn" to an id is plumbing, not the operation under test. The read tools
// are declared once, in eval.config.json's `readTools`, and that is what permits
// them. `maxToolCalls` is what bounds how many times they may be called, and
// `forbiddenTools` is what prohibits anything.
//
// This is the exact failure the first baseline run reported, five times over:
// `MU-001 turn1:tool_selection: extraneous tool(s): planner_queryTasks` — on a case
// that must resolve a task title before it can update it. `maxToolCalls: 3` against
// one required tool is the case author saying reads were expected; the allowlist is
// where that expectation went missing.
const queryCall = {
  agentId: 'planner.action',
  toolName: 'planner_queryTasks',
  args: { titleContains: 'Deploy API' },
  ok: true,
};

it('permits a config-declared read tool the case did not list', async () => {
  const report = await runGoldenEval({
    ...noopSeams,
    cases: [applyCase],
    suite: 'smoke',
    metricConfigUrl: ACTION_CONFIG_URL,
    runConversation: async () =>
      ({
        turns: [
          { ...suspendTurn, trajectory: { toolCalls: [queryCall, createCall] } },
          { ...appliedTurn, trajectory: { toolCalls: [createCall] } },
        ],
      }) as never,
  });

  const m1 = report.cases[0]!.policies.find((p) => p.id === 'M1');
  const failed = m1?.scorers.filter((s) => !s.passed).map((s) => `${s.id}: ${s.detail}`);
  expect(failed, 'resolving a title is plumbing, not a wrong operation').toEqual([]);
  expect(m1?.verdict).toBe('pass');
});

it('still counts a read tool against the turn call budget', async () => {
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
            // Four calls against maxToolCalls: 3. Permitting reads must not mean
            // they are free — the budget is what stops a model flailing.
            trajectory: { toolCalls: [queryCall, queryCall, queryCall, createCall] },
          },
          { ...appliedTurn, trajectory: { toolCalls: [createCall] } },
        ],
      }) as never,
  });

  const m1 = report.cases[0]!.policies.find((p) => p.id === 'M1');
  expect(m1?.verdict).toBe('fail');
  expect(m1?.scorers.find((s) => s.id === 'turn1:trajectory_efficiency')?.detail).toContain(
    '4 calls > 3',
  );
});

it('keeps the turns a case DID complete when it broke mid-conversation', async () => {
  const report = await runGoldenEval({
    ...noopSeams,
    cases: [revisionCase],
    suite: 'smoke',
    metricConfigUrl: ACTION_CONFIG_URL,
    // Two turns ran; the third could not, because the model host went away.
    // (Before FUT-829 this fixture said "RV-008 decides with no open preview".
    // That is no longer an error at all — run-case scores it as a failed turn,
    // because an agent that opens no card IS the finding.)
    runConversation: async () =>
      ({
        turns: [suspendTurn, suspendTurn],
        error: 'fetch failed: model host closed the connection',
      }) as never,
  });
  const cr = report.cases[0]!;
  expect(cr.runError).toContain('model host closed');
  expect(cr.infraError).toContain('model host closed');
  expect(cr.turns).toHaveLength(2);
  expect(cr.policies.every((p) => p.verdict === 'error')).toBe(true);
  expect(report.gateFailures).toEqual([]);
});

it('records an unrecognised throw as an INFRA error, not as a gate failure', async () => {
  const report = await runGoldenEval({
    ...noopSeams,
    cases: [revisionCase],
    suite: 'smoke',
    metricConfigUrl: ACTION_CONFIG_URL,
    runConversation: async () => {
      throw new Error('ECONNREFUSED 127.0.0.1:8080');
    },
  });
  // Every metric is `error`, as before — but the run is now labelled, and the
  // gate no longer counts it. A dead model host is not a failing agent.
  expect(report.cases[0]!.policies.every((p) => p.verdict === 'error')).toBe(true);
  expect(report.cases[0]!.infraError).toContain('ECONNREFUSED');
  expect(report.gateFailures).toEqual([]);
  expect(report.infraErrors).toEqual([{ caseId: 'RV-008', reason: 'ECONNREFUSED 127.0.0.1:8080' }]);
});

it('reports one infra entry per broken case, not one per metric it claimed', async () => {
  // Three metrics, one dead model. The report must read as ONE incident.
  const threeMetricCase = {
    ...(revisionCase as object),
    metrics: { enabled: ['M3', 'M8', 'M9'] },
  } as never;
  const report = await runGoldenEval({
    ...noopSeams,
    cases: [threeMetricCase],
    suite: 'smoke',
    metricConfigUrl: ACTION_CONFIG_URL,
    runConversation: async () => {
      throw new Error('model unreachable');
    },
  });
  expect(report.cases[0]!.policies).toHaveLength(3);
  expect(report.infraErrors).toHaveLength(1);
});

it('leaves infraErrors empty on a clean run', async () => {
  const report = await runGoldenEval({
    ...noopSeams,
    cases: [revisionCase],
    suite: 'smoke',
    metricConfigUrl: ACTION_CONFIG_URL,
    runConversation: async () => ({ turns: [suspendTurn, suspendTurn, appliedTurn] }) as never,
  });
  expect(report.infraErrors).toEqual([]);
});
