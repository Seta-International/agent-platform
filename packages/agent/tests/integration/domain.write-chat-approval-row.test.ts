import { randomUUID } from 'node:crypto';
import type { ApprovalCard } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { getPendingAssignRunIdForTask } from '../../src/backend/domain/get-pending-assign-run-for-task.ts';
import {
  PendingAssignmentExistsError,
  PendingTaskPreviewExistsError,
  writeChatApprovalRow,
} from '../../src/backend/domain/write-chat-approval-row.ts';
import { withAgentTestDb } from '../helpers.ts';

function card(taskId: string, tenantId: string, userId: string): ApprovalCard {
  return {
    toolCallId: `assignment-orchestrator:${taskId}`,
    intent: 'Assign "AWS migration"',
    riskBadge: 'write',
    summary: 'Top match: Alice (1 skill(s) matched, available).',
    details: [
      {
        kind: 'candidateList',
        items: [{ id: 'u1', label: 'Alice', secondary: 'skills: aws · available', score: 0.9 }],
      },
    ],
    primary: {
      label: 'Assign to Alice',
      argsPatch: { action: 'assign', assigneeUserIds: ['u1'], taskId },
    },
    alternates: [],
    decline: { label: 'Leave unassigned' },
    meta: {
      tenantId,
      userId,
      agentPath: ['assignment', 'orchestrator'],
      toolId: 'planner_proposeAssignment',
      dedupKey: `assign:${taskId}`,
      ts: new Date().toISOString(),
    },
  };
}

describe('writeChatApprovalRow', () => {
  it('inserts both rows with the agentic run id + tool-call id and the native workflow_id', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();

      const result = await writeChatApprovalRow({
        card: card(taskId, tenantId, userId),
        mastraRunId: 'mastra-run-1',
        toolCallId: 'tool-call-1',
        threadId: 'thread-1',
        tenantId,
        userId,
        pool,
      });

      expect(result.cardInThread).toBe(true);
      const runs = await pool.query(
        `SELECT workflow_id, status, started_via FROM agent.workflow_runs WHERE run_id = $1`,
        [result.runId],
      );
      expect(runs.rows[0]).toEqual({
        workflow_id: 'planner.assignment-orchestrator',
        status: 'paused',
        started_via: 'chat',
      });
      const approvals = await pool.query(
        `SELECT step_id, status, surface_canvas, surface_chat_thread_id, mastra_run_id, tool_call_id
           FROM agent.workflow_approvals WHERE approval_id = $1`,
        [result.approvalId],
      );
      expect(approvals.rows[0]).toEqual({
        step_id: 'chat-hitl',
        status: 'pending',
        surface_canvas: false,
        surface_chat_thread_id: 'thread-1',
        mastra_run_id: 'mastra-run-1',
        tool_call_id: 'tool-call-1',
      });
    });
  });

  it('getPendingAssignRunIdForTask finds the native-suspend row', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();

      const result = await writeChatApprovalRow({
        card: card(taskId, tenantId, userId),
        mastraRunId: 'mastra-run-1',
        toolCallId: 'tool-call-1',
        threadId: 'thread-1',
        tenantId,
        userId,
        pool,
      });

      const found = await getPendingAssignRunIdForTask({ taskId, tenantId });
      expect(found).toBe(result.runId);
    });
  });

  it('is idempotent per task: a second call returns the existing approval, no duplicate row', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();

      const first = await writeChatApprovalRow({
        card: card(taskId, tenantId, userId),
        mastraRunId: 'mastra-run-1',
        toolCallId: 'tool-call-1',
        threadId: 'thread-1',
        tenantId,
        userId,
        pool,
      });
      const second = await writeChatApprovalRow({
        card: card(taskId, tenantId, userId),
        mastraRunId: 'mastra-run-2',
        toolCallId: 'tool-call-2',
        threadId: 'thread-1',
        tenantId,
        userId,
        pool,
      });

      expect(second.runId).toBe(first.runId);
      expect(second.approvalId).toBe(first.approvalId);
      const count = await pool.query(
        `SELECT count(*)::int AS n
           FROM agent.workflow_approvals a
           JOIN agent.workflow_runs r ON r.run_id = a.run_id
          WHERE r.tenant_id = $1 AND a.status = 'pending'`,
        [tenantId],
      );
      expect(count.rows[0]).toEqual({ n: 1 });
    });
  });

  it('rebinds the pending approval to a new thread when the same approver re-asks elsewhere', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();

      const first = await writeChatApprovalRow({
        card: card(taskId, tenantId, userId),
        mastraRunId: 'mastra-run-1',
        toolCallId: 'tool-call-1',
        threadId: 'thread-1',
        tenantId,
        userId,
        pool,
      });
      const second = await writeChatApprovalRow({
        card: card(taskId, tenantId, userId),
        mastraRunId: 'mastra-run-2',
        toolCallId: 'tool-call-2',
        threadId: 'thread-2',
        tenantId,
        userId,
        pool,
      });

      expect(second.approvalId).toBe(first.approvalId);
      expect(second.cardInThread).toBe(true);
      const row = await pool.query(
        `SELECT surface_chat_thread_id FROM agent.workflow_approvals WHERE approval_id = $1`,
        [first.approvalId],
      );
      expect(row.rows[0]).toEqual({ surface_chat_thread_id: 'thread-2' });
    });
  });

  it("does not rebind another approver's pending approval and flags the card as not in this thread", async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const approver = randomUUID();
      const otherUser = randomUUID();
      const taskId = randomUUID();

      const first = await writeChatApprovalRow({
        card: card(taskId, tenantId, approver),
        mastraRunId: 'mastra-run-1',
        toolCallId: 'tool-call-1',
        threadId: 'thread-1',
        tenantId,
        userId: approver,
        pool,
      });
      const second = await writeChatApprovalRow({
        card: card(taskId, tenantId, otherUser),
        mastraRunId: 'mastra-run-2',
        toolCallId: 'tool-call-2',
        threadId: 'thread-2',
        tenantId,
        userId: otherUser,
        pool,
      });

      expect(second.approvalId).toBe(first.approvalId);
      expect(second.cardInThread).toBe(false);
      const row = await pool.query(
        `SELECT surface_chat_thread_id, approver_user_id FROM agent.workflow_approvals WHERE approval_id = $1`,
        [first.approvalId],
      );
      expect(row.rows[0]).toEqual({
        surface_chat_thread_id: 'thread-1',
        approver_user_id: approver,
      });
    });
  });

  it('throws PendingAssignmentExistsError when an evented run is pending without an approval row yet', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();
      // An assignBySkill run that has started but not yet reached its HITL
      // suspend step: run row exists, approval row does not.
      await pool.query(
        `INSERT INTO agent.workflow_runs
           (run_id, workflow_id, tenant_id, started_by, started_via, input_summary, status)
         VALUES (gen_random_uuid(), 'planner.assignBySkill', $1, $2, 'event', $3::jsonb, 'running')`,
        [tenantId, randomUUID(), JSON.stringify({ taskId })],
      );

      await expect(
        writeChatApprovalRow({
          card: card(taskId, tenantId, userId),
          mastraRunId: 'mastra-run-race',
          toolCallId: 'tool-call-race',
          threadId: 'thread-race',
          tenantId,
          userId,
          pool,
        }),
      ).rejects.toBeInstanceOf(PendingAssignmentExistsError);
    });
  });
});

/** The shape buildUpdateApprovalCard emits: same card contract, but its taskId
 *  belongs to an UPDATE preview, not an assignment proposal. */
function actionCard(taskId: string, tenantId: string, userId: string): ApprovalCard {
  return {
    ...card(taskId, tenantId, userId),
    intent: 'Update "AWS migration"',
    meta: {
      tenantId,
      userId,
      agentPath: ['action', 'orchestrator'],
      toolId: 'planner_updateTask',
      ts: new Date().toISOString(),
    },
  };
}

describe('writeChatApprovalRow — per-workflow behaviour', () => {
  it('stamps the caller-supplied workflow id on the synthetic run', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();
      const { runId } = await writeChatApprovalRow({
        card: actionCard(taskId, tenantId, userId),
        workflowId: 'planner.action',
        mastraRunId: 'mr-1',
        toolCallId: 'tc-1',
        threadId: 'thread-1',
        tenantId,
        userId,
        pool,
      });
      const row = await pool.query<{ workflow_id: string }>(
        'SELECT workflow_id FROM agent.workflow_runs WHERE run_id = $1',
        [runId],
      );
      expect(row.rows[0]!.workflow_id).toBe('planner.action');
    });
  });

  it('does NOT reuse a pending assignment approval when dedup is off', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();
      // A pending ASSIGNMENT card for the same task, written the shipped way.
      const assignment = await writeChatApprovalRow({
        card: card(taskId, tenantId, userId),
        mastraRunId: 'mr-a',
        toolCallId: 'tc-a',
        threadId: 'thread-1',
        tenantId,
        userId,
        pool,
      });
      const { approvalId } = await writeChatApprovalRow({
        card: actionCard(taskId, tenantId, userId),
        workflowId: 'planner.action',
        mastraRunId: 'mr-2',
        toolCallId: 'tc-2',
        threadId: 'thread-1',
        tenantId,
        userId,
        pool,
      });
      expect(approvalId).not.toBe(assignment.approvalId);
    });
  });
});

describe('writeChatApprovalRow — the mutex follows meta.dedupKey', () => {
  /** An A2-authored assign card: a DIFFERENT workflow id, the SAME dedup key. */
  function a2AssignCard(taskId: string, tenantId: string, userId: string): ApprovalCard {
    return {
      toolCallId: `planner.action:${taskId}`,
      intent: 'Assign "AWS migration"',
      riskBadge: 'write',
      summary: 'Tuấn will be the only assignee.',
      details: [
        {
          kind: 'kvTable',
          rows: [
            { k: 'Now', v: 'Alice' },
            { k: 'After', v: 'Tuấn' },
          ],
        },
      ],
      primary: {
        label: 'Assign to Tuấn',
        argsPatch: { action: 'assign', assigneeUserIds: ['u9'], taskId, idempotencyKey: 'k' },
      },
      alternates: [],
      decline: { label: 'Cancel', argsPatch: { action: 'decline', taskId, idempotencyKey: 'k' } },
      meta: {
        tenantId,
        userId,
        agentPath: ['action', 'orchestrator'],
        toolId: 'planner_assignTask',
        workflowId: 'planner.action',
        dedupKey: `assign:${taskId}`,
        ts: new Date().toISOString(),
      },
    };
  }

  // §0.3 regression 1: before this change an A2 assign card lost the mutex and
  // two people could be proposed for one task at once.
  it('reuses a pending assignment-runtime card for an A2 assign card on the same task', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();

      const first = await writeChatApprovalRow({
        card: card(taskId, tenantId, userId),
        mastraRunId: 'mr-a',
        toolCallId: 'tc-a',
        threadId: 'thread-1',
        tenantId,
        userId,
        pool,
      });
      const second = await writeChatApprovalRow({
        card: a2AssignCard(taskId, tenantId, userId),
        workflowId: 'planner.action',
        mastraRunId: 'mr-b',
        toolCallId: 'tc-b',
        threadId: 'thread-1',
        tenantId,
        userId,
        pool,
      });

      expect(second.approvalId).toBe(first.approvalId);
      expect(second.runId).toBe(first.runId);
    });
  });

  // And the other direction, which a "reuse the assignment row" special case
  // would have missed.
  it('reuses a pending A2 assign card for an assignment-runtime card on the same task', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();

      const first = await writeChatApprovalRow({
        card: a2AssignCard(taskId, tenantId, userId),
        workflowId: 'planner.action',
        mastraRunId: 'mr-a',
        toolCallId: 'tc-a',
        threadId: 'thread-1',
        tenantId,
        userId,
        pool,
      });
      const second = await writeChatApprovalRow({
        card: card(taskId, tenantId, userId),
        mastraRunId: 'mr-b',
        toolCallId: 'tc-b',
        threadId: 'thread-1',
        tenantId,
        userId,
        pool,
      });

      expect(second.approvalId).toBe(first.approvalId);
    });
  });

  it('does not mutex two cards whose dedup keys name different tasks', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const first = await writeChatApprovalRow({
        card: card(randomUUID(), tenantId, userId),
        mastraRunId: 'mr-a',
        toolCallId: 'tc-a',
        threadId: 'thread-1',
        tenantId,
        userId,
        pool,
      });
      const second = await writeChatApprovalRow({
        card: card(randomUUID(), tenantId, userId),
        mastraRunId: 'mr-b',
        toolCallId: 'tc-b',
        threadId: 'thread-1',
        tenantId,
        userId,
        pool,
      });
      expect(second.approvalId).not.toBe(first.approvalId);
    });
  });

  // A card that declares nothing gets no mutex — an update/link/merge preview
  // has no one-at-a-time rule, and inheriting one would swallow a second
  // legitimate card in silence.
  it('applies no mutex to a card that declares no dedupKey', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();
      const first = await writeChatApprovalRow({
        card: actionCard(taskId, tenantId, userId),
        workflowId: 'planner.action',
        mastraRunId: 'mr-a',
        toolCallId: 'tc-a',
        threadId: 'thread-1',
        tenantId,
        userId,
        pool,
      });
      const second = await writeChatApprovalRow({
        card: actionCard(taskId, tenantId, userId),
        workflowId: 'planner.action',
        mastraRunId: 'mr-b',
        toolCallId: 'tc-b',
        threadId: 'thread-1',
        tenantId,
        userId,
        pool,
      });
      expect(second.approvalId).not.toBe(first.approvalId);
    });
  });
});

/** An A2 update card: one `task:` key per target, no assign key. */
function updateCard(taskIds: string[], tenantId: string, userId: string): ApprovalCard {
  return {
    toolCallId: `planner.action:${taskIds[0]}`,
    intent: taskIds.length === 1 ? 'Update "Deploy API"' : `Update ${taskIds.length} tasks`,
    riskBadge: 'write',
    summary: 'Due will change.',
    details: [{ kind: 'kvTable', rows: [{ k: 'Due', v: '12 Aug → 21 Aug' }] }],
    primary: {
      label: 'Apply the change',
      argsPatch: {
        action: 'update',
        targets: taskIds.map((id) => ({ taskId: id, expectedVersion: 1 })),
        patch: { due_at: '2026-08-21T16:59:00.000Z' },
        idempotencyKey: randomUUID(),
      },
    },
    alternates: [],
    decline: { label: 'Cancel', argsPatch: { action: 'decline' } },
    meta: {
      tenantId,
      userId,
      agentPath: ['action', 'orchestrator'],
      workflowId: 'planner.action',
      toolId: 'planner_updateTask',
      dedupKeys: taskIds.map((id) => `task:${id}`),
      ts: new Date().toISOString(),
    },
  };
}

async function write(
  pool: import('pg').Pool,
  card: ApprovalCard,
  over: Partial<{ threadId: string }> = {},
) {
  return writeChatApprovalRow({
    card,
    mastraRunId: `mastra-${randomUUID()}`,
    toolCallId: `tool-${randomUUID()}`,
    threadId: over.threadId ?? `thread-${randomUUID()}`,
    tenantId: card.meta.tenantId,
    userId: card.meta.userId,
    pool,
  });
}

describe('writeChatApprovalRow — the generalized task: mutex (FUT-840 AC1)', () => {
  it('refuses a SECOND pending preview for the same task', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();
      await write(pool, updateCard([taskId], tenantId, userId));

      await expect(write(pool, updateCard([taskId], tenantId, userId))).rejects.toBeInstanceOf(
        PendingTaskPreviewExistsError,
      );
      const pending = await pool.query(
        `SELECT count(*)::int AS n FROM agent.workflow_approvals
          WHERE tenant_id = $1 AND status = 'pending'`,
        [tenantId],
      );
      expect(pending.rows[0].n).toBe(1);
    });
  });

  it('does not name the other person in the refusal — the mutex is per tenant (design D18)', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const taskId = randomUUID();
      const other = randomUUID();
      await write(pool, updateCard([taskId], tenantId, other));

      const mine = randomUUID();
      const err = await write(pool, updateCard([taskId], tenantId, mine)).catch((e) => e);
      expect(err).toBeInstanceOf(PendingTaskPreviewExistsError);
      expect(err.message).not.toContain(other);
    });
  });

  it('allows two pending previews for DIFFERENT tasks (AC3 requires this)', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      await write(pool, updateCard([randomUUID()], tenantId, userId));
      await write(pool, updateCard([randomUUID()], tenantId, userId));

      const pending = await pool.query(
        `SELECT count(*)::int AS n FROM agent.workflow_approvals
          WHERE tenant_id = $1 AND status = 'pending'`,
        [tenantId],
      );
      expect(pending.rows[0].n).toBe(2);
    });
  });

  it('is tenant-isolated: the same task in another tenant is not a clash', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const taskId = randomUUID();
      await write(pool, updateCard([taskId], randomUUID(), randomUUID()));
      await expect(
        write(pool, updateCard([taskId], randomUUID(), randomUUID())),
      ).resolves.toMatchObject({ approvalId: expect.any(String) });
    });
  });

  it('a card declaring NO key has no mutex at all — create stacks freely', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const keyless = updateCard([randomUUID()], tenantId, userId);
      keyless.meta.dedupKeys = undefined;
      await write(pool, keyless);
      const second = updateCard([randomUUID()], tenantId, userId);
      second.meta.dedupKeys = undefined;
      await expect(write(pool, second)).resolves.toMatchObject({ approvalId: expect.any(String) });
    });
  });

  it('a bulk card clashes when ANY of its 20 keys is taken', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taken = randomUUID();
      await write(pool, updateCard([taken], tenantId, userId));

      const twenty = [...Array.from({ length: 19 }, () => randomUUID()), taken];
      await expect(write(pool, updateCard(twenty, tenantId, userId))).rejects.toBeInstanceOf(
        PendingTaskPreviewExistsError,
      );
    });
  });

  it('ignores a decided row: a task whose preview was cancelled can be previewed again', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();
      const first = await write(pool, updateCard([taskId], tenantId, userId));
      await pool.query(
        `UPDATE agent.workflow_approvals SET status = 'rejected' WHERE approval_id = $1`,
        [first.approvalId],
      );
      await expect(write(pool, updateCard([taskId], tenantId, userId))).resolves.toMatchObject({
        approvalId: expect.any(String),
      });
    });
  });
});

describe('writeChatApprovalRow — dedup key PRECEDENCE (design D11)', () => {
  it('a new assign card against a pending ASSIGN card REUSES it', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();
      const a2Assign = card(taskId, tenantId, userId);
      a2Assign.meta.dedupKeys = [`assign:${taskId}`, `task:${taskId}`];
      a2Assign.meta.dedupKey = undefined;

      const first = await write(pool, a2Assign);
      const second = await write(pool, a2Assign);
      // assign: is declared FIRST, so the reuse rule wins over the refuse rule
      // even though this card satisfies both.
      expect(second.approvalId).toBe(first.approvalId);
    });
  });

  it('a new assign card against a pending UPDATE card for the same task is REFUSED', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();
      await write(pool, updateCard([taskId], tenantId, userId));

      const a2Assign = card(taskId, tenantId, userId);
      a2Assign.meta.dedupKeys = [`assign:${taskId}`, `task:${taskId}`];
      a2Assign.meta.dedupKey = undefined;
      // The assign: key finds no pending ASSIGN proposal, so evaluation falls
      // through to the task: key, which does clash. Handing back a due-date card
      // in reply to an assignment request would answer a question nobody asked.
      await expect(write(pool, a2Assign)).rejects.toBeInstanceOf(PendingTaskPreviewExistsError);
    });
  });
});

describe('writeChatApprovalRow — the advisory lock makes AC1 an invariant (design D16)', () => {
  it('two connections inserting the same task: key concurrently leave exactly ONE pending row', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();

      // A pre-check plus a best-effort guard cannot honour AC1: two concurrent
      // turns both see a clear table and both INSERT. The lock is the guarantee.
      const results = await Promise.allSettled([
        write(pool, updateCard([taskId], tenantId, userId)),
        write(pool, updateCard([taskId], tenantId, userId)),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

      const pending = await pool.query(
        `SELECT count(*)::int AS n FROM agent.workflow_approvals
          WHERE tenant_id = $1 AND status = 'pending'`,
        [tenantId],
      );
      expect(pending.rows[0].n).toBe(1);
    });
  });

  it('a 20-key bulk card contending with single-key cards does not deadlock', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskIds = Array.from({ length: 20 }, () => randomUUID());

      // Sorted acquisition inside the writer is what rules this out. An
      // inconsistent order between a 20-key card and a 1-key card is the classic
      // two-transaction deadlock.
      const results = await Promise.allSettled([
        write(pool, updateCard(taskIds, tenantId, userId)),
        write(pool, updateCard([taskIds[19]!], tenantId, userId)),
        write(pool, updateCard([taskIds[0]!], tenantId, userId)),
      ]);
      // Whoever wins, nobody deadlocks: no result carries Postgres SQLSTATE 40P01.
      for (const r of results) {
        if (r.status === 'rejected') {
          expect((r.reason as { code?: string }).code).not.toBe('40P01');
        }
      }
      expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    });
  });
});

describe('writeChatApprovalRow — the atomic swap (FUT-840 design D8, AC1)', () => {
  it('voids the old approval AND its run row, and inserts the new one, in ONE transaction', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();
      const first = await write(pool, updateCard([taskId], tenantId, userId));

      const revised = updateCard([taskId], tenantId, userId);
      revised.meta.supersedes = first.approvalId;
      const second = await write(pool, revised);

      const old = await pool.query(
        `SELECT status, decision_payload, decided_at FROM agent.workflow_approvals
          WHERE approval_id = $1`,
        [first.approvalId],
      );
      expect(old.rows[0].status).toBe('superseded');
      expect(old.rows[0].decision_payload).toEqual({ reason: 'revised' });
      expect(old.rows[0].decided_at).not.toBeNull();

      const oldRun = await pool.query(
        `SELECT status, finished_at FROM agent.workflow_runs WHERE run_id = $1`,
        [first.runId],
      );
      expect(oldRun.rows[0].status).toBe('canceled');
      expect(oldRun.rows[0].finished_at).not.toBeNull();

      // Exactly ONE pending row for the task: none has two, none has zero.
      const pending = await pool.query(
        `SELECT approval_id FROM agent.workflow_approvals
          WHERE tenant_id = $1 AND status = 'pending'`,
        [tenantId],
      );
      expect(pending.rows.map((r) => r.approval_id)).toEqual([second.approvalId]);
    });
  });

  it('a supersedes target that is already APPROVED is a no-op, and the new row still lands', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();
      const first = await write(pool, updateCard([taskId], tenantId, userId));
      // The user Confirmed the stale card while the revision was still narrating.
      await pool.query(
        `UPDATE agent.workflow_approvals SET status = 'approved' WHERE approval_id = $1`,
        [first.approvalId],
      );

      const revised = updateCard([taskId], tenantId, userId);
      revised.meta.supersedes = first.approvalId;
      // NOT an error: throwing would destroy the new card of a user who did
      // nothing wrong. The task: key is free again, so the INSERT proceeds.
      const second = await write(pool, revised);

      expect(second.approvalId).not.toBe(first.approvalId);
      const old = await pool.query(
        `SELECT status FROM agent.workflow_approvals WHERE approval_id = $1`,
        [first.approvalId],
      );
      expect(old.rows[0].status).toBe('approved');
    });
  });

  it('a supersedes target already past expires_at but still pending is superseded normally', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();
      const first = await write(pool, updateCard([taskId], tenantId, userId));
      await pool.query(
        `UPDATE agent.workflow_approvals SET expires_at = now() - interval '1 hour'
          WHERE approval_id = $1`,
        [first.approvalId],
      );

      const revised = updateCard([taskId], tenantId, userId);
      revised.meta.supersedes = first.approvalId;
      await write(pool, revised);

      const old = await pool.query(
        `SELECT status FROM agent.workflow_approvals WHERE approval_id = $1`,
        [first.approvalId],
      );
      expect(old.rows[0].status).toBe('superseded');
    });
  });

  it("does NOT supersede another user's approval", async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const victim = randomUUID();
      const victimTask = randomUUID();
      const theirs = await write(pool, updateCard([victimTask], tenantId, victim));

      const attacker = randomUUID();
      const revised = updateCard([randomUUID()], tenantId, attacker);
      revised.meta.supersedes = theirs.approvalId;
      await write(pool, revised);

      const untouched = await pool.query(
        `SELECT status FROM agent.workflow_approvals WHERE approval_id = $1`,
        [theirs.approvalId],
      );
      expect(untouched.rows[0].status).toBe('pending');
    });
  });

  it("does NOT supersede another tenant's approval", async () => {
    await withAgentTestDb(async ({ pool }) => {
      const userId = randomUUID();
      const theirs = await write(pool, updateCard([randomUUID()], randomUUID(), userId));

      const revised = updateCard([randomUUID()], randomUUID(), userId);
      revised.meta.supersedes = theirs.approvalId;
      await write(pool, revised);

      const untouched = await pool.query(
        `SELECT status FROM agent.workflow_approvals WHERE approval_id = $1`,
        [theirs.approvalId],
      );
      expect(untouched.rows[0].status).toBe('pending');
    });
  });

  it('a supersedes naming a row that does not exist is a no-op, not a crash', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const revised = updateCard([randomUUID()], tenantId, userId);
      revised.meta.supersedes = randomUUID();
      await expect(write(pool, revised)).resolves.toMatchObject({
        approvalId: expect.any(String),
      });
    });
  });

  it('leaves the OLD card pending and inserts nothing when the transaction rolls back', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskA = randomUUID();
      const taskB = randomUUID();
      const first = await write(pool, updateCard([taskA], tenantId, userId));
      // A second card holds taskB, so the revision below clashes on taskB and the
      // whole transaction rolls back AFTER the supersede statement ran.
      await write(pool, updateCard([taskB], tenantId, userId));

      const revised = updateCard([taskA, taskB], tenantId, userId);
      revised.meta.supersedes = first.approvalId;
      await expect(write(pool, revised)).rejects.toBeInstanceOf(PendingTaskPreviewExistsError);

      // The failure mode is "old card still pending, new card absent" — the user
      // keeps a resolvable preview. Strictly better than losing both.
      const old = await pool.query(
        `SELECT status FROM agent.workflow_approvals WHERE approval_id = $1`,
        [first.approvalId],
      );
      expect(old.rows[0].status).toBe('pending');
      const oldRun = await pool.query(`SELECT status FROM agent.workflow_runs WHERE run_id = $1`, [
        first.runId,
      ]);
      expect(oldRun.rows[0].status).toBe('paused');
    });
  });
});
