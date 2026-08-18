// RV-008's shape — ask → revise → confirm — with a SCRIPTED model.
//
// The case that reached production: on 14/08 A2 was shown a correct OPEN PREVIEW
// block and, across four turns, emitted text and called nothing. Here the model is
// scripted to do the right thing, so what is under test is the HARNESS: that a
// revise turn receives the open preview, that its `correction: true` is scored,
// and that Confirm writes the revised value rather than the original one.
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '@mastra/core/storage';
import { MockLanguageModelV3 } from 'ai/test';
import { expect, it } from 'vitest';
import { buildPlannerActionEvalTarget } from '../../../src/backend/orchestration/eval-target.ts';
import {
  ACTION_REFERENCE_TIME,
  D_AUG_15,
  D_AUG_19,
} from '../../fixtures/golden/action/constants.ts';
import { makeActionCaseRunner } from '../../fixtures/golden/action/run-case.ts';
import { cleanActionWorld, seedActionWorld } from '../../fixtures/golden/action/world.ts';
import { runGoldenEval } from '../../fixtures/golden/golden-eval-runner.ts';
import { ACTION_CONFIG_URL } from '../../fixtures/golden/metric-policy.ts';
import type { GoldenCase } from '../../fixtures/golden/schema.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

/** Turn 1 proposes 15/08. Turn 2 (the revise turn) proposes 19/08 with
 *  `correction: true`. Every later step just stops with text. */
function scriptedRevision(taskId: string) {
  const calls: unknown[] = [
    { taskRefs: [taskId], patch: { dueAt: D_AUG_15 } },
    { taskRefs: [taskId], patch: { dueAt: D_AUG_19 }, correction: true },
  ];
  let step = -1;
  return new MockLanguageModelV3({
    doStream: async () => {
      step += 1;
      const input = calls.shift();
      const parts = input
        ? [
            {
              type: 'tool-call',
              toolCallId: `call-${step}`,
              toolName: 'planner_updateTask',
              input: JSON.stringify(input),
            },
          ]
        : [
            { type: 'text-start', id: '0' },
            { type: 'text-delta', id: '0', delta: 'Đã cập nhật "Deploy API".' },
            { type: 'text-end', id: '0' },
          ];
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            for (const p of parts) controller.enqueue(p);
            controller.enqueue({
              type: 'finish',
              usage,
              finishReason: input ? 'tool-calls' : 'stop',
            });
            controller.close();
          },
        }),
        rawCall: { rawPrompt: null, rawSettings: {} },
      } as never;
    },
  });
}

it('scores a revise-then-confirm case: nothing written until Confirm, then the REVISED value', async () => {
  await withAgentTestDb(async ({ pool, databaseUrl }) => {
    const world = await seedActionWorld(pool);
    const taskId = randomUUID();

    // ONE scripted model for the whole case: the script is a conversation, so a
    // fresh instance per turn would re-propose 15/08 on the revise turn.
    const model = scriptedRevision(taskId);

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

    const rv008 = {
      schemaVersion: 1,
      kind: 'conversation',
      id: 'RV-008',
      suites: ['smoke'],
      holdout: false,
      tags: [],
      category: 'revision',
      actor: { tenantId: world.tenantId, userId: 'member' },
      fixtures: ['oneTaskDueAug15'],
      turns: [
        {
          user: `đổi due date của Deploy API sang ${D_AUG_15}`,
          expected: {
            behavior: 'confirm',
            facts: [],
            dbEffects: 'none',
            trajectory: { requiredTools: ['planner_updateTask'], maxToolCalls: 2 },
          },
        },
        {
          user: `À thôi đổi sang ${D_AUG_19} đi`,
          expected: {
            behavior: 'confirm',
            facts: [],
            dbEffects: 'none',
            trajectory: {
              requiredTools: ['planner_updateTask'],
              maxToolCalls: 2,
              argPredicates: [
                {
                  tool: 'planner_updateTask',
                  path: 'patch.dueAt',
                  operator: 'equals',
                  value: D_AUG_19,
                },
                { tool: 'planner_updateTask', path: 'correction', operator: 'equals', value: true },
              ],
            },
            output: { forbiddenText: ['yêu cầu mới', 'huỷ đề xuất'] },
          },
        },
        {
          decision: { chosen: 'primary' },
          expected: {
            behavior: 'applied',
            facts: [],
            // A Confirm RESUMES the suspended call, so the tool runs again and
            // shows up in the turn's trajectory. Declaring it is what asserts the
            // write actually succeeded; leaving it out makes the real call read as
            // an extraneous one.
            trajectory: { requiredTools: ['planner_updateTask'], maxToolCalls: 1 },
            dbEffects: {
              rowsChanged: 1,
              after: [{ table: 'planner.tasks', id: 'fixtures.task', due_at: D_AUG_19 }],
            },
          },
        },
      ],
      metrics: { enabled: ['M8', 'M3', 'M9'] },
    } as unknown as GoldenCase;

    const report = await runGoldenEval({
      cases: [rv008],
      suite: 'smoke',
      metricConfigUrl: ACTION_CONFIG_URL,
      manifest: {
        agentVersion: 'planner-action',
        promptVersion: 'a2-v1',
        productionModelVersion: 'mock',
        judgeModelVersion: 'mock',
        harnessVersion: 'a2-part3',
      },
      runAgent: async () => ({ answer: '', trajectory: { toolCalls: [] } }),
      runRetrieval: async () => [],
      runConversation: runner,
    });

    expect(report.gateFailures).toEqual([]);
    const cr = report.cases[0]!;
    expect(cr.turns).toHaveLength(3);
    // Turn 2 saw the open preview and adjusted it: one call, nothing written.
    expect(cr.turns![1]!.trajectory.map((t) => t.toolName)).toEqual(['planner_updateTask']);
    expect(cr.turns![1]!.observed?.rowsChanged).toBe(0);
    // Turn 3 wrote exactly one row, and it holds the REVISED date.
    expect(cr.turns![2]!.observed?.rowsChanged).toBe(1);
    const row = await pool.query<{ due_at: Date }>(
      'SELECT due_at FROM planner.tasks WHERE id = $1',
      [taskId],
    );
    expect(row.rows[0]!.due_at.toISOString()).toContain(D_AUG_19);

    await cleanActionWorld(pool, world);
  });
}, 300_000);
