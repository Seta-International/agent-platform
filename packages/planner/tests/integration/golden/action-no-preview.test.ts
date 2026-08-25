// The finding that used to be thrown away.
//
// A2's real revision bug is that it announces an intent in prose and calls no tool
// ("Tôi sẽ bỏ qua bản xem trước cũ…"), so the Confirm turn arrives with no open
// card. run-case used to THROW there, which marked every metric the case claimed
// `error` — and an errored case is worse than a failed one: it says nothing at all.
// Here the model is scripted to do exactly that, and the case must be SCORED.
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '@mastra/core/storage';
import { MockLanguageModelV3 } from 'ai/test';
import { expect, it } from 'vitest';
import { buildPlannerActionEvalTarget } from '../../../src/backend/orchestration/eval-target.ts';
import { ACTION_REFERENCE_TIME, D_AUG_19 } from '../../fixtures/golden/action/constants.ts';
import { makeActionCaseRunner } from '../../fixtures/golden/action/run-case.ts';
import { cleanActionWorld, seedActionWorld } from '../../fixtures/golden/action/world.ts';
import { runGoldenEval } from '../../fixtures/golden/golden-eval-runner.ts';
import { ACTION_CONFIG_URL } from '../../fixtures/golden/metric-policy.ts';
import type { GoldenCase } from '../../fixtures/golden/schema.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

/** Talks, never calls a tool. No tool call ⇒ no suspend ⇒ no open card. */
function talksNeverActs() {
  return new MockLanguageModelV3({
    doStream: async () =>
      ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'text-start', id: '0' });
            controller.enqueue({
              type: 'text-delta',
              id: '0',
              delta: 'Tôi sẽ đổi due date giúp bạn.',
            });
            controller.enqueue({ type: 'text-end', id: '0' });
            controller.enqueue({ type: 'finish', usage, finishReason: 'stop' });
            controller.close();
          },
        }),
        rawCall: { rawPrompt: null, rawSettings: {} },
      }) as never,
  });
}

it('scores a Confirm turn that has no open preview instead of erroring the whole case', async () => {
  await withAgentTestDb(async ({ pool, databaseUrl }) => {
    const world = await seedActionWorld(pool);
    const taskId = randomUUID();
    const model = talksNeverActs();

    const runner = makeActionCaseRunner({
      pool,
      world,
      runFixtures: async () => {
        await pool.query(
          `INSERT INTO planner.tasks (id, tenant_id, plan_id, bucket_id, title, created_by)
           VALUES ($1, $2, $3, $4, 'Deploy API', $5)`,
          [taskId, world.tenantId, world.planId, world.bucketId, world.adminUserId],
        );
        return { task: taskId };
      },
      buildTarget: (previews) =>
        buildPlannerActionEvalTarget({
          previewPort: previews.port,
          databaseUrl,
          now: () => ACTION_REFERENCE_TIME,
          resolveModel: () => model as never,
          mastraStorage: new InMemoryStore() as never,
        }),
    });

    const noPreviewCase = {
      schemaVersion: 1,
      kind: 'conversation',
      id: 'RV-NOPREVIEW',
      suites: ['smoke'],
      holdout: false,
      tags: [],
      category: 'revision',
      actor: { tenantId: world.tenantId, userId: 'member' },
      fixtures: ['oneTaskDueAug15'],
      turns: [
        {
          user: `đổi due date của Deploy API sang ${D_AUG_19}`,
          expected: {
            behavior: 'confirm',
            facts: [],
            dbEffects: 'none',
            trajectory: { requiredTools: ['planner_updateTask'], maxToolCalls: 2 },
          },
        },
        {
          decision: { chosen: 'primary' },
          expected: {
            behavior: 'applied',
            facts: [],
            trajectory: { requiredTools: ['planner_updateTask'], maxToolCalls: 1 },
            dbEffects: {
              rowsChanged: 1,
              after: [{ table: 'planner.tasks', id: 'fixtures.task', due_at: D_AUG_19 }],
            },
          },
        },
      ],
      metrics: { enabled: ['M8', 'M9'] },
    } as unknown as GoldenCase;

    const report = await runGoldenEval({
      cases: [noPreviewCase],
      suite: 'smoke',
      metricConfigUrl: ACTION_CONFIG_URL,
      manifest: {
        agentVersion: 'planner-action',
        promptVersion: 'a2-v1',
        productionModelVersion: 'mock',
        judgeModelVersion: 'mock',
        harnessVersion: 'a2-fut829',
      },
      runAgent: async () => ({ answer: '', trajectory: { toolCalls: [] } }),
      runRetrieval: async () => [],
      runConversation: runner,
    });

    const cr = report.cases[0]!;
    // The case RAN. It is a failure, and failure is information.
    expect(cr.infraError, 'a silent agent is not an infrastructure fault').toBeUndefined();
    expect(report.infraErrors).toEqual([]);
    expect(cr.turns).toHaveLength(2);
    expect(cr.turns![1]!.trajectory).toEqual([]);
    expect(cr.turns![1]!.observed?.rowsChanged).toBe(0);

    // Both metrics produce a real verdict, and it is `fail` — never `error`.
    for (const id of ['M8', 'M9']) {
      const p = cr.policies.find((x) => x.id === id)!;
      expect(p.verdict, `${id} must be scored, not errored`).toBe('fail');
    }
    const m8 = cr.policies.find((p) => p.id === 'M8')!;
    expect(m8.scorers.find((s) => s.id === 'turn2:tool_selection')?.passed).toBe(false);
    const m9 = cr.policies.find((p) => p.id === 'M9')!;
    expect(m9.scorers.find((s) => s.id === 'turn2:expected_behavior')?.passed).toBe(false);

    await cleanActionWorld(pool, world);
  });
}, 300_000);
