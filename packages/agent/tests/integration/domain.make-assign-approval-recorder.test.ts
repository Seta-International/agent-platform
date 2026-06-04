import { randomUUID } from 'node:crypto';
import type { ApprovalCard } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import {
  makeAssignApprovalRecorder,
  PendingAssignmentExistsError,
} from '../../src/backend/domain/make-assign-approval-recorder.ts';
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

describe('makeAssignApprovalRecorder', () => {
  it('inserts the synthetic run + pending approval on first call', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();
      const recorder = makeAssignApprovalRecorder({
        tenantId,
        userId,
        threadId: 'thread-1',
        pool,
      });

      const ids = await recorder(card(taskId, tenantId, userId));

      const runs = await pool.query(
        `SELECT workflow_id, status FROM agent.workflow_runs WHERE run_id = $1`,
        [ids.runId],
      );
      expect(runs.rows[0]).toEqual({
        workflow_id: '__chat_hitl:planner_proposeAssignment',
        status: 'paused',
      });
      const approvals = await pool.query(
        `SELECT status, surface_chat_thread_id FROM agent.workflow_approvals WHERE approval_id = $1`,
        [ids.approvalId],
      );
      expect(approvals.rows[0]).toEqual({
        status: 'pending',
        surface_chat_thread_id: 'thread-1',
      });
    });
  });

  it('is idempotent per task: the second call returns the existing approval, no duplicate row', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();
      const recorder = makeAssignApprovalRecorder({
        tenantId,
        userId,
        threadId: 'thread-1',
        pool,
      });

      const first = await recorder(card(taskId, tenantId, userId));
      const second = await recorder(card(taskId, tenantId, userId));

      expect(second).toEqual(first);
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
      const recorder = makeAssignApprovalRecorder({
        tenantId,
        userId,
        threadId: 'thread-1',
        pool,
      });

      await expect(recorder(card(taskId, tenantId, userId))).rejects.toBeInstanceOf(
        PendingAssignmentExistsError,
      );
    });
  });

  it('a card without a taskId argsPatch inserts without the mutex check (defensive path)', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const recorder = makeAssignApprovalRecorder({
        tenantId,
        userId,
        threadId: null,
        pool,
      });
      const c = card(randomUUID(), tenantId, userId);
      c.primary.argsPatch = { action: 'assign', assigneeUserIds: ['u1'] }; // no taskId

      const ids = await recorder(c);

      expect(ids.runId).toBeTruthy();
      expect(ids.approvalId).toBeTruthy();
    });
  });
});
