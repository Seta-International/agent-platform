import { randomUUID } from 'node:crypto';
import type { ApprovalCard } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { getPendingAssignRunIdForTask } from '../../src/backend/domain/get-pending-assign-run-for-task.ts';
import {
  PendingAssignmentExistsError,
  writeChatApprovalRow,
} from '../../src/backend/domain/write-chat-approval-row.ts';
import { withAgentTestDb } from '../helpers.ts';

function card(taskId: string, tenantId: string, userId: string): ApprovalCard {
  return {
    toolCallId: `staffing-orchestrator:${taskId}`,
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
      agentPath: ['staffing', 'orchestrator'],
      toolId: 'planner_proposeAssignment',
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
        workflow_id: 'staffing.orchestrator',
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
