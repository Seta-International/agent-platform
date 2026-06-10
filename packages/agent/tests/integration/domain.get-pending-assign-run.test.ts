import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { getPendingAssignRunIdForTask } from '../../src/backend/domain/get-pending-assign-run-for-task.ts';
import { withAgentTestDb } from '../helpers.ts';

interface SeedRunArgs {
  pool: Pool;
  runId?: string;
  workflowId?: string;
  status?: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
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
       (approval_id, run_id, step_id, proposed_payload, approver_user_id, status, expires_at)
     VALUES ($1, $2, 'assignBySkill.suggest', $3::jsonb, $4, $5, now() + interval '1 hour')`,
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
        workflowId: 'staffing.orchestrator',
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
      await seedRun({ pool, tenantId, status: 'completed', inputSummary: { taskId } });
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
