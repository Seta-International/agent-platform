import { expect, it } from 'vitest';
import { buildPlannerQueryEvalTarget } from '../../../src/backend/orchestration/eval-target.ts';
import { ACTOR_USER_ID, TENANT_ID } from '../../fixtures/golden/constants.ts';
import { embedGoldenTasks } from '../../fixtures/golden/embed-tasks.ts';
import { hasEvalModelEnv, resolveEvalGenModel } from '../../fixtures/golden/eval-models.ts';
import { cleanGoldenDataset, seedGoldenDataset } from '../../fixtures/golden/index.ts';
import { loadGoldenCases } from '../../fixtures/golden/loader.ts';
import { preflightGolden } from '../../fixtures/golden/oracles/preflight.ts';
import { expectedBehavior, noFabrication } from '../../fixtures/golden/policy/scorers.ts';
import { runRetrievalCases } from '../../fixtures/golden/retrieval-runner.ts';
import { buildRunManifest } from '../../fixtures/golden/run-manifest.ts';
import { makeGoldenVectorSearch } from '../../fixtures/golden/vector-search.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

const READ_PERMS = new Set([
  'planner.task.read',
  'planner.plan.read',
  'planner.group.read',
  'people.person.read',
]);

// Nightly driver: reset → seed → login → embed → preflight → run → score, all
// under one live golden tenant. Retrieval cases score deterministically off real
// pgvector; one agent case runs the real orchestrator and scores answer-level
// policies. (Full A1/A2 tool-trajectory gating awaits the trajectory-source
// follow-up; see the trajectory-scorers plan Task 9.)
it.skipIf(!hasEvalModelEnv())(
  'runs the golden E2E lane: preflight + retrieval scoring + a real agent case',
  async () => {
    await withAgentTestDb(async ({ pool, databaseUrl }) => {
      // 1. reset → seed → login → embed
      await cleanGoldenDataset(pool);
      await seedGoldenDataset(pool);
      await embedGoldenTasks(pool, databaseUrl, [TENANT_ID]);

      // 2. preflight (infra gate; embeddings checked separately — people index not
      //    embedded in-process here, so checkEmbeddings:false).
      await expect(preflightGolden(pool, { checkEmbeddings: false })).resolves.toMatchObject({
        ok: true,
      });

      // 3. run manifest — agent-under-test = the env's configured model.
      const { key: genKey, model } = resolveEvalGenModel();
      const manifest = buildRunManifest({
        agentVersion: 'planner-query',
        promptVersion: 'golden-v2',
        productionModelVersion: genKey,
        judgeModelVersion: 'n/a',
        harnessVersion: 'phase-2a',
      });
      expect(manifest.seedChecksum).toMatch(/^[0-9a-f]{64}$/);

      // 4. retrieval scoring against real pgvector search
      const retrievalCases = loadGoldenCases({ includeAll: true }).filter(
        (c) => c.kind === 'retrieval' && c.id === 'RET-001',
      );
      const retrievalResults = await runRetrievalCases({
        cases: retrievalCases,
        decoyIds: [],
        search: makeGoldenVectorSearch(databaseUrl),
      });
      expect(retrievalResults[0]!.policy.verdict).toBe('pass');

      // 5. one real agent case through the orchestrator, answer-level scoring
      const runtime = buildPlannerQueryEvalTarget({ databaseUrl }).buildQualityRuntime({
        resolveModel: () => model,
      });
      const run = await runtime.runStream(
        { userText: 'How many open tasks do I have?', taskId: null },
        { tenantId: TENANT_ID, actorUserId: ACTOR_USER_ID, effectivePermissions: READ_PERMS },
      );
      const { result } = (await run.finalize()) as { result: { answer: string } };

      const observedBehavior = result.answer.trim().length > 0 ? 'answer' : 'empty';
      const behavior = expectedBehavior({ expected: 'answer', observed: observedBehavior });
      const fabrication = noFabrication({
        answer: result.answer,
        forbiddenEntities: [],
        forbiddenText: [],
      });
      expect(behavior.passed).toBe(true);
      expect(fabrication.passed).toBe(true);

      await cleanGoldenDataset(pool);
    });
  },
  180_000,
);
