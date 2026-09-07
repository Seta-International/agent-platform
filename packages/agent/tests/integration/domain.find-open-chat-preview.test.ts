import { randomUUID } from 'node:crypto';
import type { ApprovalCard } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import {
  findOpenChatPreview,
  findOpenPreviewsForTasks,
  loadChatPreviewById,
} from '../../src/backend/domain/find-open-chat-preview.ts';
import { writeChatApprovalRow } from '../../src/backend/domain/write-chat-approval-row.ts';
import { buildSession, withAgentTestDb } from '../helpers.ts';

const ACTION_WORKFLOW = 'planner.action';
const ASSIGNMENT_WORKFLOW = 'planner.assignment-orchestrator';

function updateCard(opts: {
  taskId: string;
  tenantId: string;
  userId: string;
  toolId?: string;
  dueAt?: string;
}): ApprovalCard {
  return {
    toolCallId: `planner.action:${opts.taskId}`,
    intent: 'Update "Deploy API"',
    riskBadge: 'write',
    summary: 'Due will change.',
    details: [
      { kind: 'kvTable', rows: [{ k: 'Due', v: `12 Aug 2026 → ${opts.dueAt ?? '21 Aug 2026'}` }] },
    ],
    primary: {
      label: 'Apply the change',
      argsPatch: {
        action: 'update',
        targets: [{ taskId: opts.taskId, expectedVersion: 4 }],
        patch: { due_at: '2026-08-21T16:59:00.000Z' },
        idempotencyKey: randomUUID(),
      },
    },
    alternates: [],
    decline: { label: 'Cancel', argsPatch: { action: 'decline' } },
    meta: {
      tenantId: opts.tenantId,
      userId: opts.userId,
      agentPath: ['action', 'orchestrator'],
      workflowId: ACTION_WORKFLOW,
      toolId: opts.toolId ?? 'planner_updateTask',
      dedupKeys: [`task:${opts.taskId}`],
      ts: new Date().toISOString(),
    },
  };
}

/** One pending A2 card in a thread, written through the real writer. */
async function seedPreview(
  pool: import('pg').Pool,
  args: {
    tenantId: string;
    userId: string;
    threadId: string;
    taskId: string;
    workflowId?: string;
    approvalTtlHours?: number;
  },
) {
  return writeChatApprovalRow({
    card: updateCard({ taskId: args.taskId, tenantId: args.tenantId, userId: args.userId }),
    mastraRunId: `mastra-${randomUUID()}`,
    toolCallId: `tool-${randomUUID()}`,
    threadId: args.threadId,
    tenantId: args.tenantId,
    userId: args.userId,
    pool,
    ...(args.workflowId ? { workflowId: args.workflowId } : {}),
    ...(args.approvalTtlHours !== undefined ? { approvalTtlHours: args.approvalTtlHours } : {}),
  });
}

describe('findOpenChatPreview', () => {
  it('returns the NEWEST pending A2 card in the thread (design D5)', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const session = buildSession({ tenantId, userId });
      const threadId = `thread-${randomUUID()}`;

      const older = await seedPreview(pool, {
        tenantId,
        userId,
        threadId,
        taskId: randomUUID(),
      });
      // created_at is now(); force a distinguishable ordering.
      await pool.query(
        `UPDATE agent.workflow_approvals SET created_at = now() - interval '5 minutes'
          WHERE approval_id = $1`,
        [older.approvalId],
      );
      const newer = await seedPreview(pool, {
        tenantId,
        userId,
        threadId,
        taskId: randomUUID(),
      });

      const found = await findOpenChatPreview({
        session,
        threadId,
        workflowIds: [ACTION_WORKFLOW],
      });
      expect(found?.approvalId).toBe(newer.approvalId);
      expect(found?.card.meta.toolId).toBe('planner_updateTask');
      expect(found?.card.primary.argsPatch?.targets).toBeDefined();
    });
  });

  it('returns null when the only pending card is an ASSIGNMENT card — this is what keeps design D2 true', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const threadId = `thread-${randomUUID()}`;
      await seedPreview(pool, {
        tenantId,
        userId,
        threadId,
        taskId: randomUUID(),
        workflowId: ASSIGNMENT_WORKFLOW,
      });

      const found = await findOpenChatPreview({
        session: buildSession({ tenantId, userId }),
        threadId,
        workflowIds: [ACTION_WORKFLOW],
      });
      expect(found).toBeNull();
    });
  });

  it("returns null for another user's card in the same thread", async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const owner = randomUUID();
      const threadId = `thread-${randomUUID()}`;
      await seedPreview(pool, { tenantId, userId: owner, threadId, taskId: randomUUID() });

      const found = await findOpenChatPreview({
        session: buildSession({ tenantId, userId: randomUUID() }),
        threadId,
        workflowIds: [ACTION_WORKFLOW],
      });
      expect(found).toBeNull();
    });
  });

  it.each(['superseded', 'expired', 'approved', 'rejected'])(
    'returns null for a %s row — only pending is adjustable',
    async (status) => {
      await withAgentTestDb(async ({ pool }) => {
        const tenantId = randomUUID();
        const userId = randomUUID();
        const threadId = `thread-${randomUUID()}`;
        const { approvalId } = await seedPreview(pool, {
          tenantId,
          userId,
          threadId,
          taskId: randomUUID(),
        });
        await pool.query(`UPDATE agent.workflow_approvals SET status = $2 WHERE approval_id = $1`, [
          approvalId,
          status,
        ]);

        const found = await findOpenChatPreview({
          session: buildSession({ tenantId, userId }),
          threadId,
          workflowIds: [ACTION_WORKFLOW],
        });
        expect(found).toBeNull();
      });
    },
  );

  it('DOES return a row past expires_at that the sweeper has not claimed — revise must agree with Confirm (spec §5)', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const threadId = `thread-${randomUUID()}`;
      const { approvalId } = await seedPreview(pool, {
        tenantId,
        userId,
        threadId,
        taskId: randomUUID(),
      });
      // Past its TTL but still `pending`: expiry is a persisted state the sweeper
      // owns, and recordApprovalDecision checks status only — so this row is
      // still CONFIRMABLE. A lookup that filtered expires_at would produce a card
      // the user can Confirm but not adjust, plus a refusal loop against the
      // task: mutex.
      await pool.query(
        `UPDATE agent.workflow_approvals SET expires_at = now() - interval '1 hour'
          WHERE approval_id = $1`,
        [approvalId],
      );

      const found = await findOpenChatPreview({
        session: buildSession({ tenantId, userId }),
        threadId,
        workflowIds: [ACTION_WORKFLOW],
      });
      expect(found?.approvalId).toBe(approvalId);
    });
  });

  it('is tenant-isolated', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const userId = randomUUID();
      const threadId = `thread-${randomUUID()}`;
      await seedPreview(pool, {
        tenantId: randomUUID(),
        userId,
        threadId,
        taskId: randomUUID(),
      });

      const found = await findOpenChatPreview({
        session: buildSession({ tenantId: randomUUID(), userId }),
        threadId,
        workflowIds: [ACTION_WORKFLOW],
      });
      expect(found).toBeNull();
    });
  });

  it('returns null for an empty workflowIds list rather than matching everything', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const threadId = `thread-${randomUUID()}`;
      await seedPreview(pool, { tenantId, userId, threadId, taskId: randomUUID() });

      const found = await findOpenChatPreview({
        session: buildSession({ tenantId, userId }),
        threadId,
        workflowIds: [],
      });
      expect(found).toBeNull();
    });
  });
});

describe('findOpenPreviewsForTasks', () => {
  it('answers which of the asked keys a pending card already holds', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taken = randomUUID();
      const free = randomUUID();
      await seedPreview(pool, {
        tenantId,
        userId,
        threadId: `thread-${randomUUID()}`,
        taskId: taken,
      });

      const hits = await findOpenPreviewsForTasks({
        session: buildSession({ tenantId, userId }),
        dedupKeys: [`task:${taken}`, `task:${free}`],
      });
      expect(hits).toEqual([`task:${taken}`]);
    });
  });

  it("sees ANOTHER approver's card — the task: mutex is per TENANT (design D18)", async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const taskId = randomUUID();
      await seedPreview(pool, {
        tenantId,
        userId: randomUUID(),
        threadId: `thread-${randomUUID()}`,
        taskId,
      });

      const hits = await findOpenPreviewsForTasks({
        session: buildSession({ tenantId, userId: randomUUID() }),
        dedupKeys: [`task:${taskId}`],
      });
      expect(hits).toEqual([`task:${taskId}`]);
    });
  });

  it('ignores a decided card', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();
      const { approvalId } = await seedPreview(pool, {
        tenantId,
        userId,
        threadId: `thread-${randomUUID()}`,
        taskId,
      });
      await pool.query(
        `UPDATE agent.workflow_approvals SET status = 'approved' WHERE approval_id = $1`,
        [approvalId],
      );

      expect(
        await findOpenPreviewsForTasks({
          session: buildSession({ tenantId, userId }),
          dedupKeys: [`task:${taskId}`],
        }),
      ).toEqual([]);
    });
  });

  it('is tenant-isolated and returns [] for an empty ask', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const taskId = randomUUID();
      await seedPreview(pool, {
        tenantId: randomUUID(),
        userId: randomUUID(),
        threadId: `thread-${randomUUID()}`,
        taskId,
      });
      const session = buildSession({ tenantId: randomUUID(), userId: randomUUID() });
      expect(await findOpenPreviewsForTasks({ session, dedupKeys: [`task:${taskId}`] })).toEqual(
        [],
      );
      expect(await findOpenPreviewsForTasks({ session, dedupKeys: [] })).toEqual([]);
    });
  });
});

describe('loadChatPreviewById', () => {
  it('returns the card for a pending approval of this tenant and approver', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const { approvalId } = await seedPreview(pool, {
        tenantId,
        userId,
        threadId: `thread-${randomUUID()}`,
        taskId: randomUUID(),
      });

      const found = await loadChatPreviewById({
        session: buildSession({ tenantId, userId }),
        approvalId,
        workflowIds: [ACTION_WORKFLOW],
      });
      expect(found?.approvalId).toBe(approvalId);
      expect(found?.card.meta.toolId).toBe('planner_updateTask');
    });
  });

  it("returns null for another user's approval — a UUID in text buys no access", async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const { approvalId } = await seedPreview(pool, {
        tenantId,
        userId: randomUUID(),
        threadId: `thread-${randomUUID()}`,
        taskId: randomUUID(),
      });

      expect(
        await loadChatPreviewById({
          session: buildSession({ tenantId, userId: randomUUID() }),
          approvalId,
          workflowIds: [ACTION_WORKFLOW],
        }),
      ).toBeNull();
    });
  });

  it("returns null for another tenant's approval", async () => {
    await withAgentTestDb(async ({ pool }) => {
      const userId = randomUUID();
      const { approvalId } = await seedPreview(pool, {
        tenantId: randomUUID(),
        userId,
        threadId: `thread-${randomUUID()}`,
        taskId: randomUUID(),
      });

      expect(
        await loadChatPreviewById({
          session: buildSession({ tenantId: randomUUID(), userId }),
          approvalId,
          workflowIds: [ACTION_WORKFLOW],
        }),
      ).toBeNull();
    });
  });

  it('returns null once the approval is decided', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const { approvalId } = await seedPreview(pool, {
        tenantId,
        userId,
        threadId: `thread-${randomUUID()}`,
        taskId: randomUUID(),
      });
      await pool.query(
        `UPDATE agent.workflow_approvals SET status = 'approved' WHERE approval_id = $1`,
        [approvalId],
      );

      expect(
        await loadChatPreviewById({
          session: buildSession({ tenantId, userId }),
          approvalId,
          workflowIds: [ACTION_WORKFLOW],
        }),
      ).toBeNull();
    });
  });

  it('returns null for a card belonging to another runtime — this keeps design D2 true', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const { approvalId } = await seedPreview(pool, {
        tenantId,
        userId,
        threadId: `thread-${randomUUID()}`,
        taskId: randomUUID(),
        workflowId: ASSIGNMENT_WORKFLOW,
      });

      expect(
        await loadChatPreviewById({
          session: buildSession({ tenantId, userId }),
          approvalId,
          workflowIds: [ACTION_WORKFLOW],
        }),
      ).toBeNull();
    });
  });

  it('does NOT filter on expires_at, so revise and Confirm agree (spec §5)', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const { approvalId } = await seedPreview(pool, {
        tenantId,
        userId,
        threadId: `thread-${randomUUID()}`,
        taskId: randomUUID(),
      });
      await pool.query(
        `UPDATE agent.workflow_approvals SET expires_at = now() - interval '1 hour'
          WHERE approval_id = $1`,
        [approvalId],
      );

      expect(
        (
          await loadChatPreviewById({
            session: buildSession({ tenantId, userId }),
            approvalId,
            workflowIds: [ACTION_WORKFLOW],
          })
        )?.approvalId,
      ).toBe(approvalId);
    });
  });
});
