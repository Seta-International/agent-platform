import { randomUUID } from 'node:crypto';
import type { Mastra } from '@mastra/core';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { CopilotRouteEnv, SessionLike } from '../src/backend/routes.ts';
import { registerCopilotRoutes } from '../src/backend/routes.ts';
import { onLifecycleEvent } from '../src/backend/workflows/lifecycle-hook.ts';
import { withCopilotTestDb } from './test-helpers.ts';

function session(perms: string[], tenantId = randomUUID(), userId = randomUUID()): SessionLike {
  return {
    tenant_id: tenantId,
    user_id: userId,
    effective_permissions: new Set(perms),
    role_summary: { roles: [], cross_tenant_read: false },
  };
}

function makeApp(
  s: SessionLike | null,
  mastra: Mastra,
  pool: import('pg').Pool,
): Hono<CopilotRouteEnv> {
  const app = new Hono<CopilotRouteEnv>();
  app.use('*', async (c, next) => {
    if (s) c.set('session', s);
    await next();
  });
  registerCopilotRoutes(app, {
    factory: (() => ({
      get: () => null,
      specs: () => [],
    })) as never,
    mastra,
    pool,
  });
  return app;
}

function makeMastra(resume: ReturnType<typeof vi.fn>, start?: ReturnType<typeof vi.fn>): Mastra {
  return {
    getWorkflow: () => ({
      createRun: async ({ runId }: { runId?: string }) => ({
        runId: runId ?? randomUUID(),
        resume,
        start: start ?? vi.fn().mockResolvedValue(undefined),
      }),
    }),
  } as unknown as Mastra;
}

async function seed(
  pool: import('pg').Pool,
  args: {
    runId: string;
    tenantId: string;
    startedBy: string;
    suspended?: boolean;
    approverUserId?: string;
  },
): Promise<void> {
  await onLifecycleEvent(pool, {
    kind: 'run-started',
    runId: args.runId,
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
      runId: args.runId,
      eventSeq: 2,
      workflowId: 'copilot.x',
      tenantId: args.tenantId,
      occurredAt: new Date(),
      stepId: 'await-approval',
      suspendReason: 'hitl_pending',
      proposedPayload: {},
      approverUserId: args.approverUserId ?? args.startedBy,
      fallbackApproverUserId: null,
      surfaceCanvas: true,
      surfaceChatThreadId: null,
      expiresAt: new Date(Date.now() + 86400000),
    });
  }
}

describe('GET /api/copilot/v1/workflows/runs', () => {
  it('returns runs scoped to self', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = session(['copilot.workflow.run.read.self']);
      const runId = randomUUID();
      await seed(pool, { runId, tenantId: me.tenant_id, startedBy: me.user_id });
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request('/api/copilot/v1/workflows/runs?scope=self');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { rows: { runId: string }[]; nextCursor: string | null };
      expect(body.rows[0]?.runId).toBe(runId);
    });
  });

  it('401 without session', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const app = makeApp(null, makeMastra(vi.fn()), pool);
      const res = await app.request('/api/copilot/v1/workflows/runs');
      expect(res.status).toBe(401);
    });
  });

  it('403 when scope=tenant but caller lacks read.tenant', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = session(['copilot.workflow.run.read.self']);
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request('/api/copilot/v1/workflows/runs?scope=tenant');
      expect(res.status).toBe(403);
    });
  });
});

describe('GET /api/copilot/v1/workflows/runs/:runId', () => {
  it('200 own run', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = session(['copilot.workflow.run.read.self']);
      const runId = randomUUID();
      await seed(pool, { runId, tenantId: me.tenant_id, startedBy: me.user_id });
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request(`/api/copilot/v1/workflows/runs/${runId}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { runId: string };
      expect(body.runId).toBe(runId);
    });
  });

  it('404 invisible run', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = session(['copilot.workflow.run.read.self']);
      const runId = randomUUID();
      await seed(pool, { runId, tenantId: randomUUID(), startedBy: randomUUID() });
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request(`/api/copilot/v1/workflows/runs/${runId}`);
      expect(res.status).toBe(404);
    });
  });
});

describe('GET /api/copilot/v1/workflows/my-pending-approvals', () => {
  it('returns my pending approvals', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = session(['copilot.workflow.run.read.self']);
      const runId = randomUUID();
      await seed(pool, { runId, tenantId: me.tenant_id, startedBy: me.user_id, suspended: true });
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request('/api/copilot/v1/workflows/my-pending-approvals');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { approvalId: string }[];
      expect(body).toHaveLength(1);
    });
  });
});

describe('POST /api/copilot/v1/workflows/approvals/:id/decide', () => {
  it('decides and returns { runId, resumed }', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = session(['copilot.workflow.run.read.self', 'copilot.workflow.approve']);
      const runId = randomUUID();
      await seed(pool, { runId, tenantId: me.tenant_id, startedBy: me.user_id, suspended: true });
      const approvalId = (
        await pool.query<{ approval_id: string }>(
          `SELECT approval_id FROM copilot.workflow_approvals WHERE run_id = $1`,
          [runId],
        )
      ).rows[0]!.approval_id;

      const resume = vi.fn().mockResolvedValue(undefined);
      const app = makeApp(me, makeMastra(resume), pool);
      const res = await app.request(`/api/copilot/v1/workflows/approvals/${approvalId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'approve' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { runId: string; resumed: boolean };
      expect(body.runId).toBe(runId);
      expect(body.resumed).toBe(true);
    });
  });

  it('400 on missing/invalid body', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = session(['copilot.workflow.approve']);
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request(`/api/copilot/v1/workflows/approvals/${randomUUID()}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'bogus' }),
      });
      expect(res.status).toBe(400);
    });
  });

  it('403 when caller lacks copilot.workflow.approve', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = session(['copilot.workflow.run.read.self']);
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request(`/api/copilot/v1/workflows/approvals/${randomUUID()}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'approve' }),
      });
      expect(res.status).toBe(403);
    });
  });
});

describe('POST /api/copilot/v1/workflows/runs/:runId/rerun', () => {
  it('reruns and returns { newRunId }', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = session(['copilot.workflow.run.read.self', 'copilot.workflow.run.execute.self']);
      const runId = randomUUID();
      await seed(pool, { runId, tenantId: me.tenant_id, startedBy: me.user_id });
      const newRunId = randomUUID();
      const start = vi.fn().mockResolvedValue(undefined);
      const mastra = {
        getWorkflow: () => ({
          createRun: async () => ({ runId: newRunId, start }),
        }),
      } as unknown as Mastra;
      const app = makeApp(me, mastra, pool);
      const res = await app.request(`/api/copilot/v1/workflows/runs/${runId}/rerun`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { newRunId: string };
      expect(body.newRunId).toBe(newRunId);
    });
  });
});

describe('GET /api/copilot/v1/workflows/sse-token', () => {
  it('returns a token', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = session(['copilot.workflow.run.read.self']);
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request('/api/copilot/v1/workflows/sse-token');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { token: string };
      expect(body.token.length).toBeGreaterThan(10);
    });
  });
});
