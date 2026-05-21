import { randomUUID } from 'node:crypto';
import type { Mastra } from '@mastra/core';
import { describe, expect, it, vi } from 'vitest';
import { decideApproval } from '../src/backend/domain/decide-approval.ts';
import { listMyPendingApprovals } from '../src/backend/domain/list-my-pending-approvals.ts';
import type { SessionLike } from '../src/backend/routes.ts';
import { onLifecycleEvent } from '../src/backend/workflows/lifecycle-hook.ts';
import { withCopilotTestDb } from './test-helpers.ts';

function sessionWith(perms: string[], tenantId = randomUUID(), userId = randomUUID()): SessionLike {
  return {
    tenant_id: tenantId,
    user_id: userId,
    effective_permissions: new Set(perms),
    role_summary: { roles: [], cross_tenant_read: false },
  };
}

async function seedSuspendedRun(
  pool: import('pg').Pool,
  args: { runId: string; tenantId: string; approverUserId: string; surfaceCanvas?: boolean },
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
    proposedPayload: { userId: '77777777-7777-7777-7777-777777777777' },
    approverUserId: args.approverUserId,
    fallbackApproverUserId: null,
    surfaceCanvas: args.surfaceCanvas ?? true,
    surfaceChatThreadId: null,
    expiresAt: new Date(Date.now() + 86400000),
  });
}

function makeMastra(resume: ReturnType<typeof vi.fn>): Mastra {
  return {
    getWorkflow: () => ({
      createRun: async () => ({ resume }),
    }),
  } as unknown as Mastra;
}

describe('listMyPendingApprovals', () => {
  it('returns only the calling user pending approvals', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = sessionWith(['copilot.workflow.run.read.self']);
      const other = randomUUID();
      await seedSuspendedRun(pool, {
        runId: randomUUID(),
        tenantId: me.tenant_id,
        approverUserId: me.user_id,
      });
      await seedSuspendedRun(pool, {
        runId: randomUUID(),
        tenantId: me.tenant_id,
        approverUserId: other,
      });
      const result = await listMyPendingApprovals({ session: me });
      expect(result).toHaveLength(1);
      expect(result[0]!.approverUserId).toBe(me.user_id);
    });
  });
});

describe('decideApproval', () => {
  it('marks approved, writes outbox, calls run.resume(step, resumeData) outside the tx', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = sessionWith(['copilot.workflow.run.read.self', 'copilot.workflow.approve']);
      const runId = randomUUID();
      await seedSuspendedRun(pool, { runId, tenantId: me.tenant_id, approverUserId: me.user_id });
      const [pending] = await listMyPendingApprovals({ session: me });
      expect(pending).toBeDefined();

      const resume = vi.fn().mockResolvedValue(undefined);
      const r = await decideApproval({
        session: me,
        approvalId: pending!.approvalId,
        decision: 'approve',
        mastra: makeMastra(resume),
      });
      expect(r).toEqual({ runId, resumed: true });
      expect(resume).toHaveBeenCalledTimes(1);
      const resumeArg = resume.mock.calls[0]![0] as {
        step: string;
        resumeData: { decision: string };
      };
      expect(resumeArg.step).toBe('await-approval');
      expect(resumeArg.resumeData.decision).toBe('approve');

      const row = await pool.query<{ status: string; decided_by: string }>(
        `SELECT status, decided_by FROM copilot.workflow_approvals WHERE approval_id = $1`,
        [pending!.approvalId],
      );
      expect(row.rows[0]!.status).toBe('approved');
      expect(row.rows[0]!.decided_by).toBe(me.user_id);

      const outbox = await pool.query<{ event_type: string; payload: Record<string, unknown> }>(
        `SELECT event_type, payload FROM core.events
          WHERE aggregate_id = $1 AND event_type = 'copilot.workflow.approval.decided'`,
        [runId],
      );
      expect(outbox.rowCount).toBe(1);
      expect(outbox.rows[0]!.payload.decision).toBe('approve');
      expect(outbox.rows[0]!.payload.decided_by).toBe(me.user_id);
    });
  });

  it('rejects when caller lacks copilot.workflow.approve permission', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = sessionWith(['copilot.workflow.run.read.self']);
      await expect(
        decideApproval({
          session: me,
          approvalId: randomUUID(),
          decision: 'approve',
          mastra: makeMastra(vi.fn()),
        }),
      ).rejects.toThrow(/forbidden|permission/i);
    });
  });

  it('rejects when caller is neither approver nor step-in eligible', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const stranger = sessionWith(['copilot.workflow.approve']);
      const other = randomUUID();
      const runId = randomUUID();
      await seedSuspendedRun(pool, { runId, tenantId: stranger.tenant_id, approverUserId: other });
      const approvalId = (
        await pool.query<{ approval_id: string }>(
          `SELECT approval_id FROM copilot.workflow_approvals WHERE run_id = $1`,
          [runId],
        )
      ).rows[0]!.approval_id;

      await expect(
        decideApproval({
          session: stranger,
          approvalId,
          decision: 'approve',
          mastra: makeMastra(vi.fn()),
        }),
      ).rejects.toThrow(/forbidden/i);
    });
  });

  it('allows step-in when caller has read.tenant AND surface_canvas=true AND same tenant', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const admin = sessionWith(['copilot.workflow.approve', 'copilot.workflow.run.read.tenant']);
      const other = randomUUID();
      const runId = randomUUID();
      await seedSuspendedRun(pool, {
        runId,
        tenantId: admin.tenant_id,
        approverUserId: other,
        surfaceCanvas: true,
      });
      const approvalId = (
        await pool.query<{ approval_id: string }>(
          `SELECT approval_id FROM copilot.workflow_approvals WHERE run_id = $1`,
          [runId],
        )
      ).rows[0]!.approval_id;

      const resume = vi.fn().mockResolvedValue(undefined);
      const r = await decideApproval({
        session: admin,
        approvalId,
        decision: 'approve',
        mastra: makeMastra(resume),
      });
      expect(r.resumed).toBe(true);
    });
  });

  it('denies step-in when surface_canvas=false', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const admin = sessionWith(['copilot.workflow.approve', 'copilot.workflow.run.read.tenant']);
      const other = randomUUID();
      const runId = randomUUID();
      await seedSuspendedRun(pool, {
        runId,
        tenantId: admin.tenant_id,
        approverUserId: other,
        surfaceCanvas: false,
      });
      const approvalId = (
        await pool.query<{ approval_id: string }>(
          `SELECT approval_id FROM copilot.workflow_approvals WHERE run_id = $1`,
          [runId],
        )
      ).rows[0]!.approval_id;

      await expect(
        decideApproval({
          session: admin,
          approvalId,
          decision: 'approve',
          mastra: makeMastra(vi.fn()),
        }),
      ).rejects.toThrow(/forbidden/i);
    });
  });

  it('refuses on already-decided approval', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = sessionWith(['copilot.workflow.approve', 'copilot.workflow.run.read.self']);
      const runId = randomUUID();
      await seedSuspendedRun(pool, { runId, tenantId: me.tenant_id, approverUserId: me.user_id });
      const approvalId = (
        await pool.query<{ approval_id: string }>(
          `SELECT approval_id FROM copilot.workflow_approvals WHERE run_id = $1`,
          [runId],
        )
      ).rows[0]!.approval_id;

      const mastra = makeMastra(vi.fn().mockResolvedValue(undefined));
      await decideApproval({ session: me, approvalId, decision: 'approve', mastra });
      await expect(
        decideApproval({ session: me, approvalId, decision: 'approve', mastra }),
      ).rejects.toThrow(/already_decided|not_pending|already/i);
    });
  });

  it('rejects cross-tenant decisions even when caller has approve + read.tenant', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const admin = sessionWith(['copilot.workflow.approve', 'copilot.workflow.run.read.tenant']);
      const runId = randomUUID();
      await seedSuspendedRun(pool, {
        runId,
        tenantId: randomUUID(),
        approverUserId: randomUUID(),
        surfaceCanvas: true,
      });
      const approvalId = (
        await pool.query<{ approval_id: string }>(
          `SELECT approval_id FROM copilot.workflow_approvals WHERE run_id = $1`,
          [runId],
        )
      ).rows[0]!.approval_id;

      await expect(
        decideApproval({
          session: admin,
          approvalId,
          decision: 'approve',
          mastra: makeMastra(vi.fn()),
        }),
      ).rejects.toThrow(/forbidden/i);
    });
  });
});
