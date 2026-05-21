import { randomUUID } from 'node:crypto';
import type { Mastra } from '@mastra/core';
import { describe, expect, it, vi } from 'vitest';
import { decideApproval } from '../../src/backend/domain/decide-approval.ts';
import { getWorkflowRun } from '../../src/backend/domain/get-workflow-run.ts';
import { listMyPendingApprovals } from '../../src/backend/domain/list-my-pending-approvals.ts';
import { listWorkflowRuns } from '../../src/backend/domain/list-workflow-runs.ts';
import { rerunWorkflow } from '../../src/backend/domain/rerun-workflow.ts';
import type { SessionLike } from '../../src/backend/routes.ts';
import { onLifecycleEvent } from '../../src/backend/workflows/lifecycle-hook.ts';
import { withCopilotTestDb } from '../test-helpers.ts';

function session(tenantId: string, userId: string, perms: string[]): SessionLike {
  return {
    tenant_id: tenantId,
    user_id: userId,
    effective_permissions: new Set(perms),
    role_summary: { roles: [], cross_tenant_read: false },
  };
}

const PERMS = {
  readSelf: 'copilot.workflow.run.read.self',
  readTenant: 'copilot.workflow.run.read.tenant',
  readInstance: 'copilot.workflow.run.read.instance',
  executeSelf: 'copilot.workflow.run.execute.self',
  approve: 'copilot.workflow.approve',
} as const;

const noopMastra = (): Mastra =>
  ({
    getWorkflow: () => ({
      createRun: async () => ({
        runId: randomUUID(),
        resume: vi.fn().mockResolvedValue(undefined),
        start: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  }) as unknown as Mastra;

async function seedRun(
  pool: import('pg').Pool,
  args: {
    runId?: string;
    tenantId: string;
    startedBy: string;
    suspended?: boolean;
    approverUserId?: string;
    surfaceCanvas?: boolean;
  },
): Promise<string> {
  const runId = args.runId ?? randomUUID();
  await onLifecycleEvent(pool, {
    kind: 'run-started',
    runId,
    eventSeq: 1,
    workflowId: 'copilot.x',
    tenantId: args.tenantId,
    startedBy: args.startedBy,
    startedVia: 'event',
    parentThreadId: null,
    parentRunId: null,
    sourceEventId: null,
    inputSummary: {},
    occurredAt: new Date(),
  });
  if (args.suspended) {
    await onLifecycleEvent(pool, {
      kind: 'run-suspended',
      runId,
      eventSeq: 2,
      workflowId: 'copilot.x',
      tenantId: args.tenantId,
      occurredAt: new Date(),
      stepId: 'await-approval',
      suspendReason: 'hitl_pending',
      proposedPayload: {},
      approverUserId: args.approverUserId ?? args.startedBy,
      fallbackApproverUserId: null,
      surfaceCanvas: args.surfaceCanvas ?? true,
      surfaceChatThreadId: null,
      expiresAt: new Date(Date.now() + 86400000),
    });
  }
  return runId;
}

describe('RBAC boundary: workflow runs cross-tenant invisibility', () => {
  it('listWorkflowRuns scope=tenant excludes other-tenant runs even with read.tenant', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = session(randomUUID(), randomUUID(), [PERMS.readSelf, PERMS.readTenant]);
      await seedRun(pool, { tenantId: randomUUID(), startedBy: randomUUID() });
      const result = await listWorkflowRuns({ session: me, scope: 'tenant' });
      expect(result.rows).toHaveLength(0);
    });
  });

  it('getWorkflowRun returns null for other-tenant runs to a read.tenant caller', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = session(randomUUID(), randomUUID(), [PERMS.readSelf, PERMS.readTenant]);
      const runId = await seedRun(pool, { tenantId: randomUUID(), startedBy: randomUUID() });
      const row = await getWorkflowRun({ session: me, runId });
      expect(row).toBeNull();
    });
  });

  it('read.instance breaks the tenant boundary (intentional escape hatch for superadmin)', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const admin = session(randomUUID(), randomUUID(), [PERMS.readSelf, PERMS.readInstance]);
      const runId = await seedRun(pool, { tenantId: randomUUID(), startedBy: randomUUID() });
      const row = await getWorkflowRun({ session: admin, runId });
      expect(row?.runId).toBe(runId);
    });
  });
});

describe('RBAC boundary: approval power separation', () => {
  it('ops viewer (read.tenant only) cannot call decideApproval', async () => {
    await withCopilotTestDb(async ({ pool: _pool }) => {
      const viewer = session(randomUUID(), randomUUID(), [PERMS.readSelf, PERMS.readTenant]);
      await expect(
        decideApproval({
          session: viewer,
          approvalId: randomUUID(),
          decision: 'approve',
          mastra: noopMastra(),
        }),
      ).rejects.toThrow(/forbidden|permission/i);
    });
  });

  it('approve without read does not bypass tenant boundary', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const stranger = session(randomUUID(), randomUUID(), [PERMS.approve]);
      const otherTenant = randomUUID();
      const runId = await seedRun(pool, {
        tenantId: otherTenant,
        startedBy: randomUUID(),
        suspended: true,
      });
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
          mastra: noopMastra(),
        }),
      ).rejects.toThrow(/forbidden/i);
    });
  });
});

describe('RBAC boundary: step-in rule', () => {
  it('tenant admin (approve + read.tenant) step-in is allowed only when surface_canvas=true', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const admin = session(randomUUID(), randomUUID(), [PERMS.approve, PERMS.readTenant]);
      const otherUser = randomUUID();
      const runId = await seedRun(pool, {
        tenantId: admin.tenant_id,
        startedBy: otherUser,
        suspended: true,
        approverUserId: otherUser,
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
          mastra: noopMastra(),
        }),
      ).rejects.toThrow(/forbidden/i);
    });
  });

  it('step-in succeeds when surface_canvas=true + same tenant + read.tenant', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const admin = session(randomUUID(), randomUUID(), [PERMS.approve, PERMS.readTenant]);
      const otherUser = randomUUID();
      const runId = await seedRun(pool, {
        tenantId: admin.tenant_id,
        startedBy: otherUser,
        suspended: true,
        approverUserId: otherUser,
        surfaceCanvas: true,
      });
      const approvalId = (
        await pool.query<{ approval_id: string }>(
          `SELECT approval_id FROM copilot.workflow_approvals WHERE run_id = $1`,
          [runId],
        )
      ).rows[0]!.approval_id;
      const r = await decideApproval({
        session: admin,
        approvalId,
        decision: 'approve',
        mastra: noopMastra(),
      });
      expect(r.resumed).toBe(true);
    });
  });
});

describe('RBAC boundary: execute.self gates rerun', () => {
  it('caller without execute.self cannot rerun even own visible runs', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const viewer = session(randomUUID(), randomUUID(), [PERMS.readSelf, PERMS.readTenant]);
      const runId = await seedRun(pool, { tenantId: viewer.tenant_id, startedBy: viewer.user_id });
      await expect(rerunWorkflow({ session: viewer, runId, mastra: noopMastra() })).rejects.toThrow(
        /forbidden|permission/i,
      );
    });
  });

  it('approve permission alone does not grant rerun', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const approver = session(randomUUID(), randomUUID(), [PERMS.approve, PERMS.readSelf]);
      const runId = await seedRun(pool, {
        tenantId: approver.tenant_id,
        startedBy: approver.user_id,
      });
      await expect(
        rerunWorkflow({ session: approver, runId, mastra: noopMastra() }),
      ).rejects.toThrow(/forbidden|permission/i);
    });
  });
});

describe('RBAC boundary: listMyPendingApprovals scopes to caller', () => {
  it('returns no approvals that belong to other users in same tenant', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = session(randomUUID(), randomUUID(), [PERMS.readSelf]);
      const other = randomUUID();
      await seedRun(pool, {
        tenantId: me.tenant_id,
        startedBy: other,
        suspended: true,
        approverUserId: other,
      });
      const result = await listMyPendingApprovals({ session: me });
      expect(result).toHaveLength(0);
    });
  });
});
