import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { supersedeStaleAssignApprovals } from '../../src/backend/subscribers/supersede-stale-assign-approvals.ts';
import { withAgentTestDb } from '../helpers.ts';

async function seedSuspendedAssignRun(
  pool: Pool,
  args: { taskId: string; tenantId: string },
): Promise<{ runId: string; approvalId: string }> {
  const runId = randomUUID();
  const approvalId = randomUUID();
  await pool.query(
    `INSERT INTO agent.workflow_runs
      (run_id, workflow_id, tenant_id, started_by, started_via, input_summary, status)
     VALUES ($1, 'planner.assignBySkill', $2, $3, 'event', $4::jsonb, 'paused')`,
    [runId, args.tenantId, randomUUID(), JSON.stringify({ taskId: args.taskId })],
  );
  await pool.query(
    `INSERT INTO agent.workflow_approvals
      (approval_id, run_id, tenant_id, step_id, proposed_payload, approver_user_id, status, expires_at)
     VALUES ($1, $2, $3, 'assignBySkill.suggest', $4::jsonb, $5, 'pending', now() + interval '1 hour')`,
    [approvalId, runId, args.tenantId, JSON.stringify({ candidates: [] }), randomUUID()],
  );
  return { runId, approvalId };
}

function makeAssignedEvent(args: { taskId: string; tenantId: string; eventId?: string }) {
  return {
    id: args.eventId ?? randomUUID(),
    occurredAt: new Date(),
    tenantId: args.tenantId,
    aggregateType: 'planner.task',
    aggregateId: args.taskId,
    eventType: 'planner.task.assigned',
    eventVersion: 1,
    payload: {
      task_id: args.taskId,
      user_id: randomUUID(),
      group_id: randomUUID(),
      plan_id: randomUUID(),
    },
  };
}

describe('supersedeStaleAssignApprovals', () => {
  it('closes open assignBySkill approvals for the assigned task', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const taskId = randomUUID();
      const { approvalId } = await seedSuspendedAssignRun(pool, { taskId, tenantId });
      const tx = drizzle(pool);
      await supersedeStaleAssignApprovals(makeAssignedEvent({ taskId, tenantId }), {
        tx: tx as unknown as Parameters<typeof supersedeStaleAssignApprovals>[1]['tx'],
      });
      const row = await pool.query(
        `SELECT status, decision_payload FROM agent.workflow_approvals WHERE approval_id = $1`,
        [approvalId],
      );
      expect(row.rows[0].status).toBe('superseded');
      expect(row.rows[0].decision_payload).toMatchObject({ reason: 'task-assigned-elsewhere' });
    });
  });

  it('does not touch approvals on other tasks', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const assignedTask = randomUUID();
      const otherTask = randomUUID();
      await seedSuspendedAssignRun(pool, { taskId: assignedTask, tenantId });
      const { approvalId: untouched } = await seedSuspendedAssignRun(pool, {
        taskId: otherTask,
        tenantId,
      });
      const tx = drizzle(pool);
      await supersedeStaleAssignApprovals(makeAssignedEvent({ taskId: assignedTask, tenantId }), {
        tx: tx as unknown as Parameters<typeof supersedeStaleAssignApprovals>[1]['tx'],
      });
      const row = await pool.query(
        `SELECT status FROM agent.workflow_approvals WHERE approval_id = $1`,
        [untouched],
      );
      expect(row.rows[0].status).toBe('pending');
    });
  });

  it('is idempotent on repeated delivery of the same event', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const taskId = randomUUID();
      const { approvalId } = await seedSuspendedAssignRun(pool, { taskId, tenantId });
      const tx = drizzle(pool);
      const evt = makeAssignedEvent({ taskId, tenantId, eventId: 'evt-1' });
      await supersedeStaleAssignApprovals(evt, {
        tx: tx as unknown as Parameters<typeof supersedeStaleAssignApprovals>[1]['tx'],
      });
      await supersedeStaleAssignApprovals(evt, {
        tx: tx as unknown as Parameters<typeof supersedeStaleAssignApprovals>[1]['tx'],
      });
      const row = await pool.query(
        `SELECT status FROM agent.workflow_approvals WHERE approval_id = $1`,
        [approvalId],
      );
      expect(row.rows[0].status).toBe('superseded');
    });
  });
});

/** A chat-HITL approval row under any workflow id, whose card declares the
 *  assign dedup key. `workflowId` is a parameter precisely because the point of
 *  this change is that it stops mattering. */
async function seedChatAssignCard(
  pool: Pool,
  args: { taskId: string; tenantId: string; workflowId: string },
): Promise<string> {
  const runId = randomUUID();
  const approvalId = randomUUID();
  await pool.query(
    `INSERT INTO agent.workflow_runs
      (run_id, workflow_id, tenant_id, started_by, started_via, input_summary, status)
     VALUES ($1, $2, $3, $4, 'chat', $5::jsonb, 'paused')`,
    [runId, args.workflowId, args.tenantId, randomUUID(), JSON.stringify({ taskId: args.taskId })],
  );
  await pool.query(
    `INSERT INTO agent.workflow_approvals
      (approval_id, run_id, tenant_id, step_id, proposed_payload, approver_user_id,
       mastra_run_id, tool_call_id, status, expires_at)
     VALUES ($1, $2, $3, 'chat-hitl', $4::jsonb, $5, 'mr', 'tc', 'pending', now() + interval '1 hour')`,
    [
      approvalId,
      runId,
      args.tenantId,
      JSON.stringify({
        primary: { argsPatch: { action: 'assign', taskId: args.taskId } },
        meta: { dedupKey: `assign:${args.taskId}` },
      }),
      randomUUID(),
    ],
  );
  return approvalId;
}

describe('supersedeStaleAssignApprovals — keyed by meta.dedupKey', () => {
  async function supersede(pool: Pool, taskId: string, tenantId: string) {
    const tx = drizzle(pool);
    await supersedeStaleAssignApprovals(makeAssignedEvent({ taskId, tenantId }), {
      tx: tx as unknown as Parameters<typeof supersedeStaleAssignApprovals>[1]['tx'],
    });
  }

  async function statusOf(pool: Pool, approvalId: string): Promise<string> {
    const row = await pool.query<{ status: string }>(
      'SELECT status FROM agent.workflow_approvals WHERE approval_id = $1',
      [approvalId],
    );
    return row.rows[0]!.status;
  }

  // §0.3 regression 2: before this change an A2 assign card was never
  // superseded, so it sat pending until the 72-hour sweeper expired it.
  it('supersedes a planner.action assign card when the task is assigned elsewhere', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const taskId = randomUUID();
      const approvalId = await seedChatAssignCard(pool, {
        taskId,
        tenantId,
        workflowId: 'planner.action',
      });
      await supersede(pool, taskId, tenantId);
      expect(await statusOf(pool, approvalId)).toBe('superseded');
    });
  });

  it('still supersedes an assignment-orchestrator card', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const taskId = randomUUID();
      const approvalId = await seedChatAssignCard(pool, {
        taskId,
        tenantId,
        workflowId: 'planner.assignment-orchestrator',
      });
      await supersede(pool, taskId, tenantId);
      expect(await statusOf(pool, approvalId)).toBe('superseded');
    });
  });

  it('leaves a card for a different task alone', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const otherApproval = await seedChatAssignCard(pool, {
        taskId: randomUUID(),
        tenantId,
        workflowId: 'planner.action',
      });
      await supersede(pool, randomUUID(), tenantId);
      expect(await statusOf(pool, otherApproval)).toBe('pending');
    });
  });

  // Tenant isolation was already there via a.tenant_id; the predicate swap must
  // not lose it along with the run join.
  it('leaves another tenants card alone', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const taskId = randomUUID();
      const theirApproval = await seedChatAssignCard(pool, {
        taskId,
        tenantId: randomUUID(),
        workflowId: 'planner.action',
      });
      await supersede(pool, taskId, randomUUID());
      expect(await statusOf(pool, theirApproval)).toBe('pending');
    });
  });
});
