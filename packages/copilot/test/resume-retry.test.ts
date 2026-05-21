import { randomUUID } from 'node:crypto';
import type { Mastra } from '@mastra/core';
import { describe, expect, it, vi } from 'vitest';
import { onLifecycleEvent } from '../src/backend/workflows/lifecycle-hook.ts';
import { resumeRetry } from '../src/backend/workflows/resume-retry.ts';
import { withCopilotTestDb } from './test-helpers.ts';

function makeMastra(resume: ReturnType<typeof vi.fn>): Mastra {
  return {
    getWorkflow: () => ({
      createRun: async () => ({ resume }),
    }),
  } as unknown as Mastra;
}

async function seedDecidedButStillPaused(
  pool: import('pg').Pool,
  args: {
    runId: string;
    tenantId: string;
    decidedAt: Date;
    decisionPayload?: Record<string, unknown>;
  },
): Promise<string> {
  await onLifecycleEvent(pool, {
    kind: 'run-started',
    runId: args.runId,
    eventSeq: 1,
    workflowId: 'copilot.x',
    tenantId: args.tenantId,
    startedBy: randomUUID(),
    startedVia: 'event',
    parentThreadId: null,
    parentRunId: null,
    sourceEventId: null,
    inputSummary: {},
    occurredAt: new Date(),
  });
  await onLifecycleEvent(pool, {
    kind: 'run-suspended',
    runId: args.runId,
    eventSeq: 2,
    workflowId: 'copilot.x',
    tenantId: args.tenantId,
    occurredAt: new Date(),
    stepId: 'await-approval',
    suspendReason: 'hitl_pending',
    proposedPayload: {},
    approverUserId: randomUUID(),
    fallbackApproverUserId: null,
    surfaceCanvas: true,
    surfaceChatThreadId: null,
    expiresAt: new Date(Date.now() + 86400000),
  });
  const approvalId = (
    await pool.query<{ approval_id: string }>(
      `SELECT approval_id FROM copilot.workflow_approvals WHERE run_id = $1`,
      [args.runId],
    )
  ).rows[0]!.approval_id;
  const payload = args.decisionPayload ?? { decision: 'approve' };
  await pool.query(
    `UPDATE copilot.workflow_approvals
        SET status = 'approved', decided_at = $1, decision_payload = $2::jsonb
      WHERE run_id = $3`,
    [args.decidedAt, JSON.stringify(payload), args.runId],
  );
  return approvalId;
}

describe('resumeRetry', () => {
  it('retries Mastra resume for approvals decided > 2min ago whose run is still paused', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const runId = randomUUID();
      await seedDecidedButStillPaused(pool, {
        runId,
        tenantId: randomUUID(),
        decidedAt: new Date(Date.now() - 5 * 60 * 1000),
      });
      const resume = vi.fn().mockResolvedValue(undefined);
      const result = await resumeRetry({ pool, mastra: makeMastra(resume) });
      expect(result.retried).toBe(1);
      expect(resume).toHaveBeenCalledTimes(1);
      const arg = resume.mock.calls[0]![0] as { step: string; resumeData: { decision: string } };
      expect(arg.step).toBe('await-approval');
      expect(arg.resumeData.decision).toBe('approve');
    });
  });

  it('skips fresh (< 2min) decisions', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const runId = randomUUID();
      await seedDecidedButStillPaused(pool, {
        runId,
        tenantId: randomUUID(),
        decidedAt: new Date(Date.now() - 30 * 1000),
      });
      const resume = vi.fn().mockResolvedValue(undefined);
      const result = await resumeRetry({ pool, mastra: makeMastra(resume) });
      expect(result.retried).toBe(0);
      expect(resume).not.toHaveBeenCalled();
    });
  });

  it('skips runs whose status is not paused', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const runId = randomUUID();
      await seedDecidedButStillPaused(pool, {
        runId,
        tenantId: randomUUID(),
        decidedAt: new Date(Date.now() - 5 * 60 * 1000),
      });
      await pool.query(`UPDATE copilot.workflow_runs SET status = 'running' WHERE run_id = $1`, [
        runId,
      ]);
      const resume = vi.fn().mockResolvedValue(undefined);
      const result = await resumeRetry({ pool, mastra: makeMastra(resume) });
      expect(result.retried).toBe(0);
      expect(resume).not.toHaveBeenCalled();
    });
  });

  it('marks the run failed after 3 failed retries', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const runId = randomUUID();
      await seedDecidedButStillPaused(pool, {
        runId,
        tenantId: randomUUID(),
        decidedAt: new Date(Date.now() - 5 * 60 * 1000),
      });
      const resume = vi.fn().mockRejectedValue(new Error('boom'));
      const mastra = makeMastra(resume);
      for (let i = 0; i < 3; i++) await resumeRetry({ pool, mastra });

      const r = await pool.query<{ status: string; error_summary: string | null }>(
        `SELECT status, error_summary FROM copilot.workflow_runs WHERE run_id = $1`,
        [runId],
      );
      expect(r.rows[0]!.status).toBe('failed');
      expect(r.rows[0]!.error_summary).toMatch(/resume_failed/);
    });
  });

  it('stops retrying once retry_count reaches MAX_RETRIES', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const runId = randomUUID();
      await seedDecidedButStillPaused(pool, {
        runId,
        tenantId: randomUUID(),
        decidedAt: new Date(Date.now() - 5 * 60 * 1000),
      });
      const resume = vi.fn().mockRejectedValue(new Error('boom'));
      const mastra = makeMastra(resume);
      for (let i = 0; i < 5; i++) await resumeRetry({ pool, mastra });
      expect(resume).toHaveBeenCalledTimes(3); // not 5
    });
  });
});
