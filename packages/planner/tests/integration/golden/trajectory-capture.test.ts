import { expect, it } from 'vitest';
import { buildPlannerQueryEvalTarget } from '../../../src/backend/orchestration/eval-target.ts';
import { ACTOR_USER_ID, TENANT_ID } from '../../fixtures/golden/constants.ts';
import { embedGoldenTasks } from '../../fixtures/golden/embed-tasks.ts';
import { hasEvalModelEnv, resolveEvalGenModel } from '../../fixtures/golden/eval-models.ts';
import { cleanGoldenDataset, seedGoldenDataset } from '../../fixtures/golden/index.ts';
import { toolNames } from '../../fixtures/golden/policy/trajectory.ts';
import { seedGoldenLogin } from '../../fixtures/golden/seed-login.ts';
import { TrajectoryCollector } from '../../fixtures/golden/trajectory-collector.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

const READ_PERMS = new Set([
  'planner.task.read',
  'planner.plan.read',
  'planner.group.read',
  'people.person.read',
]);

it.skipIf(!hasEvalModelEnv())(
  'captures the two-tier tool trajectory of a real delegated run',
  async () => {
    await withAgentTestDb(async ({ pool, databaseUrl }) => {
      await cleanGoldenDataset(pool);
      await seedGoldenDataset(pool);
      await seedGoldenLogin(pool);
      await embedGoldenTasks(pool, databaseUrl, [TENANT_ID]);

      const collector = new TrajectoryCollector();
      const { model } = resolveEvalGenModel();
      const runtime = buildPlannerQueryEvalTarget({ databaseUrl, collector }).buildQualityRuntime({
        resolveModel: () => model,
      });

      const run = await runtime.runStream(
        { userText: 'How many open tasks do I have?', taskId: null },
        { tenantId: TENANT_ID, actorUserId: ACTOR_USER_ID, effectivePermissions: READ_PERMS },
      );
      await run.finalize();

      const names = toolNames(collector.toTrajectory());
      // Tier 1: a delegation (routing) tool must appear — the orchestrator routed.
      expect(names.some((n) => n.endsWith('Agent'))).toBe(true);
      // Tier 2: at least one real read tool must appear inside the sub-agent.
      expect(names.some((n) => n.startsWith('planner_') && !n.endsWith('Agent'))).toBe(true);

      await cleanGoldenDataset(pool);
    });
  },
  180_000,
);
