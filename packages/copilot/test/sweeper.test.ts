import { randomUUID } from 'node:crypto';
import type { Mastra } from '@mastra/core';
import { describe, expect, it, vi } from 'vitest';
import { onLifecycleEvent } from '../src/backend/workflows/lifecycle-hook.ts';
import { sweepWorkflowApprovals } from '../src/backend/workflows/sweeper.ts';
import { withCopilotTestDb } from './test-helpers.ts';

async function seedSuspendedRun(
  pool: import('pg').Pool,
  args: { runId: string; tenantId: string; approverUserId: string; expiresAt: Date },
): Promise<void> {
  await onLifecycleEvent(pool, {
    kind: 'run-started',
    runId: args.runId,
    eventSeq: 1,
    workflowId: 'copilot.x',
    tenantId: args.tenantId,
    startedBy: args.approverUserId,
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
    approverUserId: args.approverUserId,
    fallbackApproverUserId: null,
    surfaceCanvas: true,
    surfaceChatThreadId: null,
    expiresAt: args.expiresAt,
  });
}

function makeMastra(resume: ReturnType<typeof vi.fn>): Mastra {
  return {
    getWorkflow: () => ({
      createRun: async () => ({ resume }),
    }),
  } as unknown as Mastra;
}

describe('sweepWorkflowApprovals', () => {
  it('marks expired pending approvals as expired and resumes with decision=timeout', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const runId = randomUUID();
      await seedSuspendedRun(pool, {
        runId,
        tenantId,
        approverUserId: randomUUID(),
        expiresAt: new Date(Date.now() - 1000),
      });

      const resume = vi.fn().mockResolvedValue(undefined);
      const result = await sweepWorkflowApprovals({ pool, mastra: makeMastra(resume) });
      expect(result.expired).toBe(1);

      const a = await pool.query<{ status: string }>(
        `SELECT status FROM copilot.workflow_approvals WHERE run_id = $1`,
        [runId],
      );
      expect(a.rows[0]!.status).toBe('expired');
      expect(resume).toHaveBeenCalledTimes(1);
      const arg = resume.mock.calls[0]![0] as { step: string; resumeData: { decision: string } };
      expect(arg.step).toBe('await-approval');
      expect(arg.resumeData.decision).toBe('timeout');

      const evt = await pool.query<{ event_type: string; payload: Record<string, unknown> }>(
        `SELECT event_type, payload FROM core.events
          WHERE aggregate_id = $1 AND event_type = 'copilot.workflow.approval.decided'`,
        [runId],
      );
      expect(evt.rowCount).toBe(1);
      expect(evt.rows[0]!.payload.decision).toBe('timeout');
    });
  });

  it('is idempotent — second run is a no-op', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const runId = randomUUID();
      await seedSuspendedRun(pool, {
        runId,
        tenantId,
        approverUserId: randomUUID(),
        expiresAt: new Date(Date.now() - 1000),
      });
      const resume = vi.fn().mockResolvedValue(undefined);
      const mastra = makeMastra(resume);
      await sweepWorkflowApprovals({ pool, mastra });
      await sweepWorkflowApprovals({ pool, mastra });
      expect(resume).toHaveBeenCalledTimes(1);
    });
  });

  it('ignores non-expired pending approvals', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const runId = randomUUID();
      await seedSuspendedRun(pool, {
        runId,
        tenantId,
        approverUserId: randomUUID(),
        expiresAt: new Date(Date.now() + 86400000),
      });
      const resume = vi.fn().mockResolvedValue(undefined);
      const result = await sweepWorkflowApprovals({ pool, mastra: makeMastra(resume) });
      expect(result.expired).toBe(0);
      expect(resume).not.toHaveBeenCalled();
    });
  });

  it('continues across multiple expired rows within one sweep', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const expired1 = randomUUID();
      const expired2 = randomUUID();
      await seedSuspendedRun(pool, {
        runId: expired1,
        tenantId,
        approverUserId: randomUUID(),
        expiresAt: new Date(Date.now() - 1000),
      });
      await seedSuspendedRun(pool, {
        runId: expired2,
        tenantId,
        approverUserId: randomUUID(),
        expiresAt: new Date(Date.now() - 2000),
      });

      const resume = vi.fn().mockResolvedValue(undefined);
      const result = await sweepWorkflowApprovals({ pool, mastra: makeMastra(resume) });
      expect(result.expired).toBe(2);
      expect(resume).toHaveBeenCalledTimes(2);
    });
  });
});
