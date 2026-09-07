import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { getPendingAssignRunIdForTask } from '../../src/backend/domain/get-pending-assign-run-for-task.ts';
import { withAgentTestDb } from '../helpers.ts';

interface SeedRunArgs {
  pool: Pool;
  runId?: string;
  workflowId?: string;
  status?: 'running' | 'paused' | 'success' | 'failed' | 'canceled';
  tenantId: string;
  inputSummary?: Record<string, unknown>;
}

async function seedRun(args: SeedRunArgs): Promise<string> {
  const runId = args.runId ?? randomUUID();
  await args.pool.query(
    `INSERT INTO agent.workflow_runs
       (run_id, workflow_id, tenant_id, started_by, started_via, input_summary, status)
     VALUES ($1, $2, $3, $4, 'event', $5::jsonb, $6)`,
    [
      runId,
      args.workflowId ?? 'planner.assignBySkill',
      args.tenantId,
      randomUUID(),
      JSON.stringify(args.inputSummary ?? {}),
      args.status ?? 'running',
    ],
  );
  return runId;
}

interface SeedApprovalArgs {
  pool: Pool;
  runId: string;
  proposedPayload?: Record<string, unknown>;
  status?: 'pending' | 'approved' | 'rejected' | 'superseded' | 'expired';
}

async function seedApproval(args: SeedApprovalArgs): Promise<string> {
  const approvalId = randomUUID();
  await args.pool.query(
    `INSERT INTO agent.workflow_approvals
       (approval_id, run_id, tenant_id, step_id, proposed_payload, approver_user_id, status, expires_at)
     VALUES ($1, $2, (SELECT tenant_id FROM agent.workflow_runs WHERE run_id = $2), 'assignBySkill.suggest', $3::jsonb, $4, $5, now() + interval '1 hour')`,
    [
      approvalId,
      args.runId,
      JSON.stringify(args.proposedPayload ?? { candidates: [] }),
      randomUUID(),
      args.status ?? 'pending',
    ],
  );
  return approvalId;
}

describe('getPendingAssignRunIdForTask', () => {
  it('returns the runId of a running assignBySkill workflow even before the approval row exists', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const taskId = randomUUID();
      const runId = await seedRun({
        pool,
        tenantId,
        status: 'running',
        inputSummary: { taskId },
      });

      const result = await getPendingAssignRunIdForTask({ taskId, tenantId });

      expect(result).toBe(runId);
    });
  });

  it('returns the runId once the workflow has suspended into a pending approval', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const taskId = randomUUID();
      const runId = await seedRun({
        pool,
        tenantId,
        status: 'paused',
        inputSummary: { taskId },
      });
      await seedApproval({ pool, runId, status: 'pending' });

      const result = await getPendingAssignRunIdForTask({ taskId, tenantId });

      expect(result).toBe(runId);
    });
  });

  it('returns the runId for a native-suspend chat run whose approval payload carries the taskId', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const taskId = randomUUID();
      const runId = await seedRun({
        pool,
        tenantId,
        workflowId: 'planner.assignment-orchestrator',
        status: 'paused',
        inputSummary: { taskId, thread_id: randomUUID() },
      });
      await seedApproval({
        pool,
        runId,
        status: 'pending',
        proposedPayload: { primary: { argsPatch: { taskId } } },
      });

      const result = await getPendingAssignRunIdForTask({ taskId, tenantId });

      expect(result).toBe(runId);
    });
  });

  it('returns null when no run targets the task', async () => {
    await withAgentTestDb(async ({ pool: _pool }) => {
      const result = await getPendingAssignRunIdForTask({
        taskId: randomUUID(),
        tenantId: randomUUID(),
      });
      expect(result).toBeNull();
    });
  });

  it('excludes completed and failed runs', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const taskId = randomUUID();
      await seedRun({ pool, tenantId, status: 'success', inputSummary: { taskId } });
      await seedRun({ pool, tenantId, status: 'failed', inputSummary: { taskId } });

      const result = await getPendingAssignRunIdForTask({ taskId, tenantId });

      expect(result).toBeNull();
    });
  });

  it('does not leak runs across tenants', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const taskId = randomUUID();
      const otherTenant = randomUUID();
      await seedRun({
        pool,
        tenantId: otherTenant,
        status: 'running',
        inputSummary: { taskId },
      });

      const result = await getPendingAssignRunIdForTask({ taskId, tenantId: randomUUID() });

      expect(result).toBeNull();
    });
  });

  it('returns the most recently started run when multiple are active', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const taskId = randomUUID();
      const olderRunId = await seedRun({
        pool,
        tenantId,
        status: 'running',
        inputSummary: { taskId },
      });
      // started_at defaults to now() in the column default; nudge the older row
      // backwards so the second row is unambiguously newer.
      await pool.query(
        `UPDATE agent.workflow_runs SET started_at = now() - interval '5 minutes' WHERE run_id = $1`,
        [olderRunId],
      );
      const newerRunId = await seedRun({
        pool,
        tenantId,
        status: 'running',
        inputSummary: { taskId },
      });

      const result = await getPendingAssignRunIdForTask({ taskId, tenantId });

      expect(result).toBe(newerRunId);
    });
  });
});

describe('getPendingAssignRunIdForTask — both dedup key shapes (FUT-840 spec §3.2)', () => {
  /** A chat card under any workflow id whose meta declares the given keys. */
  async function seedChatCard(
    pool: Pool,
    args: { tenantId: string; taskId: string; meta: Record<string, unknown> },
  ): Promise<string> {
    const runId = await seedRun({
      pool,
      workflowId: 'planner.action',
      status: 'paused',
      tenantId: args.tenantId,
      inputSummary: { taskId: args.taskId },
    });
    await seedApproval({
      pool,
      runId,
      proposedPayload: {
        primary: { argsPatch: { action: 'assign', taskId: args.taskId } },
        meta: args.meta,
      },
    });
    return runId;
  }

  it('finds a card that declares the assign key in the PLURAL shape', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const taskId = randomUUID();
      const runId = await seedChatCard(pool, {
        tenantId,
        taskId,
        meta: { dedupKeys: [`assign:${taskId}`, `task:${taskId}`] },
      });

      expect(await getPendingAssignRunIdForTask({ taskId, tenantId })).toBe(runId);
    });
  });

  it('still finds a row persisted with the LEGACY singular dedupKey (spec §3.2)', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const taskId = randomUUID();
      // Exactly what a card written before FUT-840 carries.
      const runId = await seedChatCard(pool, {
        tenantId,
        taskId,
        meta: { dedupKey: `assign:${taskId}` },
      });

      expect(await getPendingAssignRunIdForTask({ taskId, tenantId })).toBe(runId);
    });
  });
});
