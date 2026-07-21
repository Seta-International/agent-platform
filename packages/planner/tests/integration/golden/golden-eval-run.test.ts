import type { MastraModelConfig } from '@mastra/core/llm';
import { expect, it } from 'vitest';
import { buildPlannerQueryEvalTarget } from '../../../src/backend/orchestration/eval-target.ts';
import {
  ACTOR_USER_ID,
  DECOY_TASK_BILLING_ID,
  DECOY_TASK_OTHER_ID,
  TENANT_ID,
} from '../../fixtures/golden/constants.ts';
import { embedGoldenTasks } from '../../fixtures/golden/embed-tasks.ts';
import { runGoldenEval } from '../../fixtures/golden/golden-eval-runner.ts';
import { cleanGoldenDataset, seedGoldenDataset } from '../../fixtures/golden/index.ts';
import { loadGoldenCases } from '../../fixtures/golden/loader.ts';
import { preflightGolden } from '../../fixtures/golden/oracles/preflight.ts';
import { runRetrievalCases } from '../../fixtures/golden/retrieval-runner.ts';
import { seedGoldenLogin } from '../../fixtures/golden/seed-login.ts';
import { TrajectoryCollector } from '../../fixtures/golden/trajectory-collector.ts';
import { makeGoldenVectorSearch } from '../../fixtures/golden/vector-search.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

const READ_PERMS = new Set([
  'planner.task.read',
  'planner.plan.read',
  'planner.group.read',
  'people.person.read',
]);
const DECOY_IDS = [DECOY_TASK_BILLING_ID, DECOY_TASK_OTHER_ID];

// Diagnostic lane: proves the data-driven driver runs end-to-end over the real
// pipeline (seed → login → embed → preflight → runGoldenEval) and surfaces which
// case/policy/scorer gated. It does NOT assert gateFailed===false: the migrated
// smoke cases reference legacy fictional entities (task-abc123, board Alpha) and
// carry strict exact-match A1 constraints that a live LLM will not always satisfy.
// Tightening those into a green gate is follow-up work (constraint/seed reconcile),
// not a scorer weakening.
it('runs the smoke suite data-driven end-to-end and reports gate outcomes', async () => {
  await withAgentTestDb(async ({ pool, databaseUrl }) => {
    await cleanGoldenDataset(pool);
    await seedGoldenDataset(pool);
    await seedGoldenLogin(pool);
    await embedGoldenTasks(pool, databaseUrl, [TENANT_ID]);
    await expect(preflightGolden(pool, { checkEmbeddings: false })).resolves.toMatchObject({
      ok: true,
    });

    const model = 'openai/gpt-4o-mini' as unknown as MastraModelConfig;
    const search = makeGoldenVectorSearch(databaseUrl);

    const report = await runGoldenEval({
      cases: loadGoldenCases({ suite: 'smoke' }),
      suite: 'smoke',
      manifest: {
        agentVersion: 'planner-query',
        promptVersion: 'golden-v2',
        productionModelVersion: 'openai/gpt-4o-mini',
        judgeModelVersion: 'n/a',
        harnessVersion: 'phase-2a',
      },
      runRetrieval: (cases) => runRetrievalCases({ cases, search, decoyIds: DECOY_IDS }),
      runAgent: async (c) => {
        const collector = new TrajectoryCollector();
        const runtime = buildPlannerQueryEvalTarget({ databaseUrl, collector }).buildQualityRuntime(
          { resolveModel: () => model },
        );
        const input =
          c.kind === 'agent'
            ? { userText: c.input.messages[c.input.messages.length - 1]!.content, taskId: null }
            : { userText: '', taskId: null };
        const run = await runtime.runStream(input, {
          tenantId: TENANT_ID,
          actorUserId: ACTOR_USER_ID,
          effectivePermissions: READ_PERMS,
        });
        const { result } = (await run.finalize()) as { result: { answer: string } };
        return { answer: result.answer, trajectory: collector.toTrajectory() };
      },
    });

    // The driver ran the whole suite and produced a structured report.
    expect(report.totalCases).toBeGreaterThan(0);
    expect(report.cases.length).toBe(report.totalCases);
    for (const cr of report.cases) expect(cr.policies.length).toBeGreaterThan(0);

    // Diagnostic surface — use stderr directly (vitest hides console.* on pass).
    const perCase = report.cases
      .map((cr) => `${cr.id}[${cr.policies.map((p) => `${p.id}:${p.verdict}`).join(',')}]`)
      .join(' ');
    process.stderr.write(
      `\n[golden smoke] cases=${report.totalCases} gateFailed=${report.gateFailed} ` +
        `failures=${report.gateFailures.length}\n[golden smoke] ${perCase}\n` +
        (report.gateFailures.length
          ? `[golden smoke] failures=${JSON.stringify(report.gateFailures)}\n`
          : ''),
    );

    await cleanGoldenDataset(pool);
  });
}, 300_000);
