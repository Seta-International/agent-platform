// The A2 seam, end to end, with a SCRIPTED model.
//
// The deterministic twin of the golden lane: the agent, its tools, the ports, the
// DB writes and the resume are all real, and only the model is scripted — so a
// Mastra upgrade that moves a chunk field or breaks resume fails HERE, on the
// default gate, instead of inside an opt-in lane nobody ran.
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
import {
  checkAfter,
  diffActionRows,
  snapshotActionRows,
} from '../../fixtures/golden/action/db-snapshot.ts';
import { ActionPreviewStore } from '../../fixtures/golden/action/preview-store.ts';
import { drainActionTurn } from '../../fixtures/golden/action/stream-turn.ts';
import { cleanActionWorld, seedActionWorld } from '../../fixtures/golden/action/world.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

/** Calls `planner_updateTask` once with `input`, then stops with `text`. Mirrors
 *  the scripted model in
 *  tests/integration/orchestration/assignment/suspend-characterization.test.ts. */
function scriptedUpdate(input: unknown, text: string) {
  let call = -1;
  const steps = [
    {
      parts: [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'planner_updateTask',
          input: JSON.stringify(input),
        },
      ],
      finishReason: 'tool-calls' as const,
    },
    {
      parts: [
        { type: 'text-start', id: '0' },
        { type: 'text-delta', id: '0', delta: text },
        { type: 'text-end', id: '0' },
      ],
      finishReason: 'stop' as const,
    },
  ];
  return new MockLanguageModelV3({
    doStream: async () => {
      call += 1;
      const step = steps[Math.min(call, steps.length - 1)]!;
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            for (const p of step.parts) controller.enqueue(p);
            controller.enqueue({ type: 'finish', usage, finishReason: step.finishReason });
            controller.close();
          },
        }),
        rawCall: { rawPrompt: null, rawSettings: {} },
      } as never;
    },
  });
}

it('suspends with a card and writes nothing, then writes exactly one row on Confirm', async () => {
  await withAgentTestDb(async ({ pool, databaseUrl }) => {
    const world = await seedActionWorld(pool);
    const taskId = randomUUID();
    await pool.query(
      `INSERT INTO planner.tasks (id, tenant_id, plan_id, bucket_id, title, due_at, created_by)
       VALUES ($1, $2, $3, $4, 'Deploy API', $5, $6)`,
      [
        taskId,
        world.tenantId,
        world.planId,
        world.bucketId,
        `${D_AUG_15}T09:00:00+07`,
        world.adminUserId,
      ],
    );

    const previews = new ActionPreviewStore();
    const target = buildPlannerActionEvalTarget({
      previewPort: previews.port,
      databaseUrl,
      now: () => ACTION_REFERENCE_TIME,
      resolveModel: () =>
        scriptedUpdate(
          { taskRefs: [taskId], patch: { dueAt: D_AUG_19 } },
          `Đổi due date của "Deploy API" sang ${D_AUG_19}, bạn xác nhận nhé.`,
        ) as never,
      mastraStorage: new InMemoryStore() as never,
    });

    const actor = {
      tenantId: world.tenantId,
      actorUserId: world.memberUserId,
      effectivePermissions: world.permissions.member,
    };
    const before = await snapshotActionRows(pool, world);

    // ── Turn 1: the preview ──
    const first = await drainActionTurn(
      await target.runStream(
        {
          userText: `đổi due date của Deploy API sang ${D_AUG_19}`,
          taskId: null,
          openPreview: null,
        },
        actor as never,
      ),
    );

    expect(first.suspended).toBe(true);
    expect(first.finishReason).toBe('suspended');
    expect(first.card).toBeDefined();
    expect(first.mastraRunId).toBeTruthy();
    expect(first.toolCallId).toBeTruthy();
    // Pins WHICH chunk field carried the arguments — the reason `stream-turn.ts`
    // reads `payload.args ?? payload.input`.
    expect(first.toolCalls.map((c) => c.toolName)).toEqual(['planner_updateTask']);
    expect(first.toolCalls[0]!.args).toMatchObject({ taskRefs: [taskId] });

    // BR-03, measured rather than asserted by hand.
    expect(diffActionRows(before, await snapshotActionRows(pool, world)).rowsChanged).toBe(0);

    // ── Turn 2: Confirm ──
    const card = first.card as { primary: { argsPatch: Record<string, unknown> } };
    const approvalId = previews.open(first.card as never);
    const resumed = await drainActionTurn(
      await target.runResume(
        card.primary.argsPatch as never,
        {
          ...actor,
          mastraRunId: first.mastraRunId!,
          toolCallId: first.toolCallId,
        } as never,
      ),
    );
    previews.decide(approvalId);

    expect(resumed.suspended).toBe(false);
    const afterSnapshot = await snapshotActionRows(pool, world);
    const diff = diffActionRows(before, afterSnapshot);
    expect(diff.rowsChanged).toBe(1);
    expect(diff.changedKeys).toEqual([`planner.tasks:${taskId}`]);
    expect(
      checkAfter(afterSnapshot, [{ table: 'planner.tasks', id: taskId, due_at: D_AUG_19 }]),
    ).toEqual([]);

    await cleanActionWorld(pool, world);
  });
}, 300_000);
