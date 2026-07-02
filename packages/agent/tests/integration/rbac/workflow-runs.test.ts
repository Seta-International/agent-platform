import { randomUUID } from 'node:crypto';
import type { Mastra } from '@mastra/core';
import { RequestContext } from '@mastra/core/request-context';
import type { SessionLike } from '@seta/agent-sdk';
import { describe, expect, it, vi } from 'vitest';
import { cancelWorkflowRun } from '../../../src/backend/domain/cancel-workflow-run.ts';
import { decideApproval } from '../../../src/backend/domain/decide-approval.ts';
import { getWorkflowRun } from '../../../src/backend/domain/get-workflow-run.ts';
import { listMyPendingApprovals } from '../../../src/backend/domain/list-my-pending-approvals.ts';
import { listWorkflowRuns } from '../../../src/backend/domain/list-workflow-runs.ts';
import { rerunWorkflow } from '../../../src/backend/domain/rerun-workflow.ts';
import { onLifecycleEvent } from '../../../src/backend/workflows/_infra/lifecycle-hook.ts';
import { buildSession, withAgentTestDb } from '../../helpers.ts';

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

function makeRequestContext(session: SessionLike): RequestContext {
  const ctx = new RequestContext();
  ctx.set('actor', { type: 'user' as const, user_id: session.user_id });
  ctx.set('tenant_id', session.tenant_id);
  return ctx;
}

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
    workflowId: 'agent.x',
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
      workflowId: 'agent.x',
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
  it('listWorkflowRuns scope=tenant excludes other-tenant runs even for agent.viewer @ tenant', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession({
        assignments: [{ role_slug: 'agent.viewer', scope_kind: 'tenant' }],
      });
      await seedRun(pool, { tenantId: randomUUID(), startedBy: randomUUID() });
      const result = await listWorkflowRuns({ session: me, scope: 'tenant' });
      expect(result.rows).toHaveLength(0);
    });
  });

  it('getWorkflowRun returns null for other-tenant runs to an agent.viewer @ tenant caller', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession({
        assignments: [{ role_slug: 'agent.viewer', scope_kind: 'tenant' }],
      });
      const runId = await seedRun(pool, { tenantId: randomUUID(), startedBy: randomUUID() });
      const row = await getWorkflowRun({ session: me, runId });
      expect(row).toBeNull();
    });
  });

  it('org.viewer (cross_tenant_read) breaks the tenant boundary (intentional escape hatch for superadmin)', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const admin = buildSession({
        assignments: [{ role_slug: 'org.viewer', scope_kind: 'tenant' }],
      });
      const runId = await seedRun(pool, { tenantId: randomUUID(), startedBy: randomUUID() });
      const row = await getWorkflowRun({ session: admin, runId });
      expect(row?.runId).toBe(runId);
    });
  });
});

describe('RBAC boundary: approval power separation', () => {
  it('a non-existent approval id resolves not_found', async () => {
    await withAgentTestDb(async ({ pool: _pool }) => {
      const viewer = buildSession({
        assignments: [{ role_slug: 'agent.viewer', scope_kind: 'tenant' }],
      });
      await expect(
        decideApproval({
          session: viewer,
          approvalId: randomUUID(),
          decision: 'approve',
          mastra: noopMastra(),
        }),
      ).rejects.toThrow(/not_found/i);
    });
  });

  it('implicit approve (self scope only) does not bypass the tenant boundary', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const stranger = buildSession();
      const otherTenant = randomUUID();
      const runId = await seedRun(pool, {
        tenantId: otherTenant,
        startedBy: randomUUID(),
        suspended: true,
      });
      const approvalId = (
        await pool.query<{ approval_id: string }>(
          `SELECT approval_id FROM agent.workflow_approvals WHERE run_id = $1`,
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
  it('agent.viewer @ tenant step-in is allowed only when surface_canvas=true', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const admin = buildSession({
        assignments: [{ role_slug: 'agent.viewer', scope_kind: 'tenant' }],
      });
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
          `SELECT approval_id FROM agent.workflow_approvals WHERE run_id = $1`,
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

  it('step-in succeeds when surface_canvas=true + same tenant + agent.viewer @ tenant', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const admin = buildSession({
        assignments: [{ role_slug: 'agent.viewer', scope_kind: 'tenant' }],
      });
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
          `SELECT approval_id FROM agent.workflow_approvals WHERE run_id = $1`,
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

describe('RBAC boundary: execute is implicit — visibility is the remaining boundary', () => {
  it('an implicit-only session (no agent role at all) can rerun a run it started', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const viewer = buildSession();
      const runId = await seedRun(pool, { tenantId: viewer.tenant_id, startedBy: viewer.user_id });
      const result = await rerunWorkflow({
        session: viewer,
        runId,
        mastra: noopMastra(),
        pool,
        requestContext: makeRequestContext(viewer),
      });
      expect(result.newRunId).toBeDefined();
    });
  });

  it('cannot rerun a run in another tenant — read-visibility denies it (not_found)', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const approver = buildSession();
      const runId = await seedRun(pool, {
        tenantId: randomUUID(),
        startedBy: randomUUID(),
      });
      await expect(
        rerunWorkflow({
          session: approver,
          runId,
          mastra: noopMastra(),
          pool,
          requestContext: makeRequestContext(approver),
        }),
      ).rejects.toThrow(/not_found/i);
    });
  });
});

describe('RBAC boundary: implicit self scope grants cancellation of own runs only', () => {
  it('implicit self scope allows cancelling own running run', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
      const runId = await seedRun(pool, { tenantId: me.tenant_id, startedBy: me.user_id });
      const publish = vi.fn().mockResolvedValue(undefined);
      const mastra = { pubsub: { publish } } as unknown as Mastra;
      await cancelWorkflowRun({ session: me, runId, mastra });
      expect(publish).toHaveBeenCalled();
    });
  });

  it('self-only cancel cannot cancel another user run visible via tenant-wide read', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const me = buildSession({
        tenantId,
        assignments: [
          { role_slug: 'agent.viewer', scope_kind: 'tenant' },
          { role_slug: 'agent.member', scope_kind: 'self' },
        ],
      });
      const runId = await seedRun(pool, { tenantId, startedBy: randomUUID() });
      const publish = vi.fn();
      const mastra = { pubsub: { publish } } as unknown as Mastra;
      await expect(cancelWorkflowRun({ session: me, runId, mastra })).rejects.toThrow(/forbidden/i);
      expect(publish).not.toHaveBeenCalled();
    });
  });
});

describe('RBAC boundary: agent.admin @ tenant grants cancellation across tenant runs', () => {
  it('agent.admin @ tenant allows cancelling another user run in same tenant', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const ops = buildSession({
        tenantId,
        assignments: [{ role_slug: 'agent.admin', scope_kind: 'tenant' }],
      });
      const runId = await seedRun(pool, { tenantId, startedBy: randomUUID() });
      const publish = vi.fn().mockResolvedValue(undefined);
      const mastra = { pubsub: { publish } } as unknown as Mastra;
      await cancelWorkflowRun({ session: ops, runId, mastra });
      expect(publish).toHaveBeenCalled();
    });
  });

  it('agent.admin @ tenant does not bypass the tenant boundary', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const ops = buildSession({
        assignments: [{ role_slug: 'agent.admin', scope_kind: 'tenant' }],
      });
      const runId = await seedRun(pool, { tenantId: randomUUID(), startedBy: randomUUID() });
      const publish = vi.fn();
      const mastra = { pubsub: { publish } } as unknown as Mastra;
      await expect(cancelWorkflowRun({ session: ops, runId, mastra })).rejects.toThrow(
        /not_found/i,
      );
      expect(publish).not.toHaveBeenCalled();
    });
  });
});

describe('RBAC boundary: listMyPendingApprovals scopes to caller', () => {
  it('returns no approvals that belong to other users in same tenant', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
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
