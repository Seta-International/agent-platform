import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { supersedeStaleAssignApprovals } from '../../src/backend/subscribers/supersede-stale-assign-approvals.ts';
import { withCopilotTestDb } from '../helpers.ts';

async function seedSuspendedAssignRun(
  pool: Pool,
  args: { taskId: string; tenantId: string },
): Promise<{ runId: string; approvalId: string }> {
  const runId = randomUUID();
  const approvalId = randomUUID();
  await pool.query(
    `INSERT INTO copilot.workflow_runs
      (run_id, workflow_id, tenant_id, started_by, started_via, input_summary, status)
     VALUES ($1, 'planner.assignBySkill', $2, $3, 'event', $4::jsonb, 'paused')`,
    [runId, args.tenantId, randomUUID(), JSON.stringify({ taskId: args.taskId })],
  );
  await pool.query(
    `INSERT INTO copilot.workflow_approvals
      (approval_id, run_id, step_id, proposed_payload, approver_user_id, status, expires_at)
     VALUES ($1, $2, 'assignBySkill.suggest', $3::jsonb, $4, 'pending', now() + interval '1 hour')`,
    [approvalId, runId, JSON.stringify({ candidates: [] }), randomUUID()],
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
    await withCopilotTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const taskId = randomUUID();
      const { approvalId } = await seedSuspendedAssignRun(pool, { taskId, tenantId });
      const tx = drizzle(pool);
      await supersedeStaleAssignApprovals(makeAssignedEvent({ taskId, tenantId }), {
        tx: tx as unknown as Parameters<typeof supersedeStaleAssignApprovals>[1]['tx'],
      });
      const row = await pool.query(
        `SELECT status, decision_payload FROM copilot.workflow_approvals WHERE approval_id = $1`,
        [approvalId],
      );
      expect(row.rows[0].status).toBe('superseded');
      expect(row.rows[0].decision_payload).toMatchObject({ reason: 'task-assigned-elsewhere' });
    });
  });

  it('does not touch approvals on other tasks', async () => {
    await withCopilotTestDb(async ({ pool }) => {
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
        `SELECT status FROM copilot.workflow_approvals WHERE approval_id = $1`,
        [untouched],
      );
      expect(row.rows[0].status).toBe('pending');
    });
  });

  it('is idempotent on repeated delivery of the same event', async () => {
    await withCopilotTestDb(async ({ pool }) => {
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
        `SELECT status FROM copilot.workflow_approvals WHERE approval_id = $1`,
        [approvalId],
      );
      expect(row.rows[0].status).toBe('superseded');
    });
  });
});
