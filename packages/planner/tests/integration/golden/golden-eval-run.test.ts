import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { buildPlannerQueryEvalTarget } from '../../../src/backend/orchestration/eval-target.ts';
import {
  ACTOR_USER_ID,
  DECOY_TASK_BILLING_ID,
  DECOY_TASK_OTHER_ID,
  TENANT_ID,
} from '../../fixtures/golden/constants.ts';
import { embedGoldenTasks } from '../../fixtures/golden/embed-tasks.ts';
import {
  hasEvalModelEnv,
  resolveEvalGenModel,
  resolveEvalJudgeModel,
} from '../../fixtures/golden/eval-models.ts';
import { type GoldenRunReport, runGoldenEval } from '../../fixtures/golden/golden-eval-runner.ts';
import { cleanGoldenDataset, seedGoldenDataset } from '../../fixtures/golden/index.ts';
import { makeGoldenJudge } from '../../fixtures/golden/judge-runner.ts';
import { loadGoldenCases } from '../../fixtures/golden/loader.ts';
import { preflightGolden } from '../../fixtures/golden/oracles/preflight.ts';
import { writeGoldenReport } from '../../fixtures/golden/report-writer.ts';
import { runRetrievalCases } from '../../fixtures/golden/retrieval-runner.ts';
import { seedGoldenLogin } from '../../fixtures/golden/seed-login.ts';
import { TrajectoryCollector } from '../../fixtures/golden/trajectory-collector.ts';
import { makeGoldenVectorSearch } from '../../fixtures/golden/vector-search.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

// The read-only permission surface every query-agent tool can require. Mirrors
// the read subset of the `planner.member` role (writes — task.create/assign,
// comment.create — are intentionally excluded; those tools are forbidden for
// the query agent). Injected as the actor's effective_permissions; the
// cross-module read tools re-check their `rbac` against this set.
const READ_PERMS = new Set([
  'planner.task.read',
  'planner.plan.read',
  'planner.group.read',
  'planner.group.member.read',
  'planner.bucket.read',
  'planner.task.comment.read',
  'planner.reporting.read',
  'people.person.read',
]);
const DECOY_IDS = [DECOY_TASK_BILLING_ID, DECOY_TASK_OTHER_ID];

type Suite = 'smoke' | 'regression' | 'nightly';

/**
 * Runs one suite end-to-end over the real pipeline (seed → login → embed →
 * preflight → runGoldenEval) and returns the structured report plus the written
 * artifact paths. Shared by the smoke (diagnostic) and regression (gated) lanes.
 */
async function runGoldenSuiteE2E(
  suite: Suite,
  opts: { includeHoldout?: boolean } = {},
): Promise<{ report: GoldenRunReport; jsonPath: string; mdPath: string }> {
  return withAgentTestDb(async ({ pool, databaseUrl }) => {
    await cleanGoldenDataset(pool);
    await seedGoldenDataset(pool);
    await seedGoldenLogin(pool);
    await embedGoldenTasks(pool, databaseUrl, [TENANT_ID]);
    await expect(preflightGolden(pool, { checkEmbeddings: false })).resolves.toMatchObject({
      ok: true,
    });

    // Agent-under-test = the environment's configured (self-hosted) model, via
    // the production registry — never a hardcoded model string.
    const { key: genKey, model } = resolveEvalGenModel();
    // Judge = an OpenAI model (EVAL_JUDGE_MODEL), independent of the agent.
    const { key: judgeKey } = resolveEvalJudgeModel();
    const search = makeGoldenVectorSearch(databaseUrl);

    const report = await runGoldenEval({
      cases: loadGoldenCases({ suite, includeHoldout: opts.includeHoldout }),
      suite,
      manifest: {
        agentVersion: 'planner-query',
        promptVersion: 'golden-v2',
        productionModelVersion: genKey,
        judgeModelVersion: judgeKey,
        harnessVersion: 'phase-2a',
      },
      runRetrieval: (cases) => runRetrievalCases({ cases, search, decoyIds: DECOY_IDS }),
      runJudge: makeGoldenJudge(),
      runAgent: async (c) => {
        const collector = new TrajectoryCollector();
        const runtime = buildPlannerQueryEvalTarget({ databaseUrl, collector }).buildQualityRuntime(
          { resolveModel: () => model },
        );
        const input =
          c.kind === 'agent'
            ? { userText: c.input.messages[c.input.messages.length - 1]!.content, taskId: null }
            : { userText: '', taskId: null };
        // Run as the case's own actor (seed-login grants every member the
        // planner.member role) so per-actor data scope is honored — e.g.
        // "my group" resolves to that member's groups. Retrieval cases never
        // reach runAgent; the constant fallback only satisfies the union type.
        // Permissions are the uniform read surface; all query cases are read-only.
        const actor =
          c.kind === 'retrieval' ? { tenantId: TENANT_ID, userId: ACTOR_USER_ID } : c.actor;
        const run = await runtime.runStream(input, {
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          effectivePermissions: READ_PERMS,
        });
        const { result } = (await run.finalize()) as { result: { answer: string } };
        return { answer: result.answer, trajectory: collector.toTrajectory() };
      },
    });

    // Persist full-fidelity diagnostic artifacts (trajectory + answer + scorer
    // detail) so a failing case can be triaged after the run without re-running.
    const reportsDir = fileURLToPath(new URL('../../fixtures/golden/.reports/', import.meta.url));
    const { jsonPath, mdPath } = writeGoldenReport(report, reportsDir);

    // Diagnostic surface — use stderr directly (vitest hides console.* on pass).
    const perCase = report.cases
      .map((cr) => `${cr.id}[${cr.policies.map((p) => `${p.id}:${p.verdict}`).join(',')}]`)
      .join(' ');
    process.stderr.write(
      `\n[golden ${suite}] cases=${report.totalCases} gateFailed=${report.gateFailed} ` +
        `failures=${report.gateFailures.length}\n[golden ${suite}] ${perCase}\n` +
        (report.gateFailures.length
          ? `[golden ${suite}] failures=${JSON.stringify(report.gateFailures)}\n`
          : '') +
        `[golden ${suite}] report: ${mdPath}\n[golden ${suite}] json:   ${jsonPath}\n`,
    );

    await cleanGoldenDataset(pool);
    return { report, jsonPath, mdPath };
  });
}

// Diagnostic lane: proves the data-driven driver runs end-to-end over the real
// pipeline and surfaces which case/policy/scorer gated. It does NOT assert
// gateFailed===false — a live LLM will not always satisfy every strict A1
// constraint on the small smoke set; the regression lane below is the gate.
it.skipIf(!hasEvalModelEnv())(
  'runs the smoke suite data-driven end-to-end and reports gate outcomes',
  async () => {
    const { report } = await runGoldenSuiteE2E('smoke');
    expect(report.totalCases).toBeGreaterThan(0);
    expect(report.cases.length).toBe(report.totalCases);
    for (const cr of report.cases) expect(cr.policies.length).toBeGreaterThan(0);
  },
  300_000,
);

// Regression gate lane: evaluates EVERY non-holdout case across all four case
// files (factual + edge + adversarial + rbac). Opt-in — it runs the full
// orchestrator per case against a live model, so it is slow and costly; enable
// with RUN_GOLDEN_REGRESSION=1 (nightly / manual). When it runs, it is a real
// gate: any gate-mode policy failure fails the test.
const RUN_REGRESSION = process.env.RUN_GOLDEN_REGRESSION === '1';
it.runIf(RUN_REGRESSION)(
  'evaluates the full regression suite and gates on every A* policy',
  async () => {
    const { report } = await runGoldenSuiteE2E('regression');
    expect(report.totalCases).toBeGreaterThan(0);
    expect(report.cases.length).toBe(report.totalCases);
    // The gate: no gate-mode policy failed on any case. Failures (if any) were
    // written to the report artifact and echoed to stderr above for triage.
    expect(report.gateFailures).toEqual([]);
    expect(report.gateFailed).toBe(false);
  },
  1_800_000,
);
