// The A2 golden lane (spec §9).
//
// OPT-IN: it runs the full A2 agent against the environment's configured model once
// per turn, and a three-turn revision case is three model calls. Enable with
// RUN_ACTION_GOLDEN=1. It is NOT on the per-change gate — that gate is the
// deterministic suites (permission-matrix, injection invariants, the per-tool unit
// suites, action-revision-invariants) plus this wave's scripted-model tests. Golden
// lanes are run deliberately, when an agent is being debugged.
import { fileURLToPath } from 'node:url';
import { InMemoryStore } from '@mastra/core/storage';
import { expect, it } from 'vitest';
import { buildPlannerActionEvalTarget } from '../../../src/backend/orchestration/eval-target.ts';
import { ACTION_REFERENCE_TIME } from '../../fixtures/golden/action/constants.ts';
import { makeFixtureRunner } from '../../fixtures/golden/action/fixtures.ts';
import { assertMetricThresholds, metricRates } from '../../fixtures/golden/action/metric-rates.ts';
import { makeActionCaseRunner } from '../../fixtures/golden/action/run-case.ts';
import { cleanActionWorld, seedActionWorld } from '../../fixtures/golden/action/world.ts';
import { resolveEvalGenModel, resolveEvalJudgeModel } from '../../fixtures/golden/eval-models.ts';
import { type GoldenRunReport, runGoldenEval } from '../../fixtures/golden/golden-eval-runner.ts';
import { cleanGoldenDataset, seedGoldenDataset } from '../../fixtures/golden/index.ts';
import { ACTION_CASES_DIR, loadGoldenCases } from '../../fixtures/golden/loader.ts';
import { ACTION_CONFIG_URL } from '../../fixtures/golden/metric-policy.ts';
import { preflightGolden } from '../../fixtures/golden/oracles/preflight.ts';
import { withGoldenLock } from '../../fixtures/golden/oracles/with-golden-lock.ts';
import { writeGoldenReport } from '../../fixtures/golden/report-writer.ts';
import { seedGoldenLogin } from '../../fixtures/golden/seed-login.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

type Suite = 'smoke' | 'regression' | 'nightly';

async function runActionSuite(
  suite: Suite,
  opts: { includeHoldout?: boolean } = {},
): Promise<{ report: GoldenRunReport; mdPath: string }> {
  return withAgentTestDb(async ({ pool, databaseUrl }) => {
    return withGoldenLock(pool, async () => {
      // A1 is seeded and left FROZEN: the preflight at the end is what proves the A2
      // corpus never wrote into it (AC2).
      await cleanGoldenDataset(pool);
      await seedGoldenDataset(pool);
      await seedGoldenLogin(pool);

      const world = await seedActionWorld(pool);
      const { key: genKey, model } = resolveEvalGenModel();
      const { key: judgeKey } = resolveEvalJudgeModel();

      const runner = makeActionCaseRunner({
        pool,
        world,
        runFixtures: makeFixtureRunner({ pool, world }),
        // One store per case: suspend snapshots are keyed by runId and must not be
        // reachable from a later case.
        buildTarget: (previews) =>
          buildPlannerActionEvalTarget({
            previewPort: previews.port,
            databaseUrl,
            now: () => ACTION_REFERENCE_TIME,
            resolveModel: () => model,
            mastraStorage: new InMemoryStore() as never,
          }),
      });

      const report = await runGoldenEval({
        cases: loadGoldenCases({
          suite,
          includeHoldout: opts.includeHoldout,
          casesDir: ACTION_CASES_DIR,
        }),
        suite,
        metricConfigUrl: ACTION_CONFIG_URL,
        manifest: {
          agentVersion: 'planner-action',
          promptVersion: 'a2-v1',
          productionModelVersion: genKey,
          judgeModelVersion: judgeKey,
          harnessVersion: 'a2-wave-1',
        },
        runAgent: async () => {
          throw new Error('the action corpus has no kind:agent cases');
        },
        runRetrieval: async () => [],
        runConversation: runner,
      });
      report.metricRates = metricRates(report, ACTION_CONFIG_URL);

      // AC2's second half: A1's facts still reconcile after the A2 corpus ran.
      await expect(preflightGolden(pool, { checkEmbeddings: false })).resolves.toMatchObject({
        ok: true,
      });

      const reportsDir = fileURLToPath(new URL('../../fixtures/golden/.reports/', import.meta.url));
      const { jsonPath, mdPath } = writeGoldenReport(report, reportsDir);

      // stderr directly: vitest hides console.* on a passing test.
      process.stderr.write(
        `\n[action ${suite}] cases=${report.totalCases} failures=${report.gateFailures.length}\n` +
          `${(report.metricRates ?? [])
            .map((r) => `[action ${suite}] ${r.id} ${r.passed}/${r.evaluated} (>= ${r.threshold})`)
            .join('\n')}\n` +
          `[action ${suite}] report: ${mdPath}\n[action ${suite}] json:   ${jsonPath}\n`,
      );

      await cleanActionWorld(pool, world);
      await cleanGoldenDataset(pool);
      return { report, mdPath };
    });
  });
}

const RUN = process.env.RUN_ACTION_GOLDEN === '1';

// Diagnostic lane: proves the corpus runs end to end and prints per-metric rates.
// Does NOT assert thresholds — smoke is 6 cases, too few for a rate to mean much.
it.runIf(RUN)(
  'runs the A2 smoke suite and reports per-metric rates',
  async () => {
    const { report } = await runActionSuite('smoke');
    expect(report.totalCases).toBeGreaterThan(0);
    for (const caseReport of report.cases) {
      expect(caseReport.skipped, `${caseReport.id} was skipped`).toBeUndefined();
      expect(caseReport.policies.length, `${caseReport.id} scored nothing`).toBeGreaterThan(0);
    }
  },
  1_800_000,
);

// The gate: every gate-mode metric at or above its threshold.
it.runIf(RUN)(
  'evaluates the A2 regression suite and gates on every metric threshold',
  async () => {
    const { report } = await runActionSuite('regression');
    expect(report.totalCases).toBeGreaterThan(0);
    assertMetricThresholds(report, ACTION_CONFIG_URL);
  },
  3_600_000,
);

// Holdout: only ever run deliberately, and never used to tune a prompt.
it.runIf(RUN && process.env.RUN_ACTION_HOLDOUT === '1')(
  'evaluates the A2 nightly suite including holdout cases',
  async () => {
    const { report } = await runActionSuite('nightly', { includeHoldout: true });
    expect(report.totalCases).toBeGreaterThan(0);
    assertMetricThresholds(report, ACTION_CONFIG_URL);
  },
  3_600_000,
);
