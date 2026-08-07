import { expect, it } from 'vitest';
import { buildPlannerQueryEvalTarget } from '../../../src/backend/orchestration/eval-target.ts';
import { ACTOR_USER_ID, TENANT_ID } from '../../fixtures/golden/constants.ts';
import { embedGoldenTasks } from '../../fixtures/golden/embed-tasks.ts';
import { hasEvalModelEnv, resolveEvalGenModel } from '../../fixtures/golden/eval-models.ts';
import { cleanGoldenDataset, seedGoldenDataset } from '../../fixtures/golden/index.ts';
import { seedGoldenLogin } from '../../fixtures/golden/seed-login.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

const READ_PERMS = new Set([
  'planner.task.read',
  'planner.plan.read',
  'planner.group.read',
  'people.person.read',
]);

it.skipIf(!hasEvalModelEnv())(
  'runs the real orchestrator against the seeded tenant and answers the open-task count',
  async () => {
    await withAgentTestDb(async ({ pool, databaseUrl }) => {
      await cleanGoldenDataset(pool);
      await seedGoldenDataset(pool);
      await seedGoldenLogin(pool);
      await embedGoldenTasks(pool, databaseUrl, [TENANT_ID]);

      // Gateway model string — Mastra routes it via the AI SDK using OPENAI_API_KEY.
      const { model } = resolveEvalGenModel();
      const runtime = buildPlannerQueryEvalTarget({ databaseUrl }).buildQualityRuntime({
        resolveModel: () => model,
      });

      const run = await runtime.runStream(
        { userText: 'How many open tasks do I have?', taskId: null },
        { tenantId: TENANT_ID, actorUserId: ACTOR_USER_ID, effectivePermissions: READ_PERMS },
      );
      const { result } = (await run.finalize()) as { result: { answer: string } };

      // Actor (ACTOR_USER_ID) has 8 open tasks in the golden facts — a grounded
      // answer must surface that count, not a hallucinated one.
      expect(result.answer.length).toBeGreaterThan(0);
      expect(result.answer).toContain('8');

      await cleanGoldenDataset(pool);
    });
  },
  180_000,
);
