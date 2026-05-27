import { randomUUID } from 'node:crypto';
import type { Mastra } from '@mastra/core';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { CopilotRouteEnv } from '../../src/backend/routes.ts';
import { registerCopilotRoutes } from '../../src/backend/routes.ts';
import type { SessionLike } from '../../src/backend/types.ts';
import { withCopilotTestDb } from '../helpers.ts';

function session(perms: string[] = []): SessionLike {
  return {
    tenant_id: randomUUID(),
    user_id: randomUUID(),
    effective_permissions: new Set(perms),
    role_summary: { roles: [], cross_tenant_read: false },
  };
}

function makeMastra(opts: {
  start?: ReturnType<typeof vi.fn>;
  runId?: string;
  unknownWorkflow?: boolean;
  /** Mastra-intrinsic workflow id (defaults to a `planner.<alias>` shape mirroring real wiring). */
  intrinsicId?: string;
}): Mastra {
  return {
    getWorkflow: (alias: string) => {
      if (opts.unknownWorkflow) return undefined;
      return {
        id: opts.intrinsicId ?? `planner.${alias}`,
        createRun: async () => ({
          runId: opts.runId ?? randomUUID(),
          start: opts.start ?? vi.fn().mockResolvedValue(undefined),
        }),
      };
    },
  } as unknown as Mastra;
}

function makeApp(s: SessionLike | null, mastra: Mastra, pool: import('pg').Pool) {
  const app = new Hono<CopilotRouteEnv>();
  app.use('*', async (c, next) => {
    if (s) c.set('session', s);
    await next();
  });
  registerCopilotRoutes(app, {
    supervisor: { stream: async () => ({}) } as never,
    mastra,
    pool,
  });
  return app;
}

describe('POST /api/copilot/v1/workflows/runs/:workflowId/start', () => {
  it('starts a workflow run with session derived from authenticated request', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const s = session();
      const start = vi.fn().mockResolvedValue(undefined);
      const runId = randomUUID();
      const app = makeApp(s, makeMastra({ start, runId }), pool);
      const res = await app.request('/api/copilot/v1/workflows/runs/assignBySkill/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: '00000000-0000-0000-0000-000000000001' }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ runId });
      // start invoked with inputData = body (no session smuggled in) and a requestContext
      // carrying the authenticated actor + tenant
      expect(start).toHaveBeenCalledTimes(1);
      const arg = start.mock.calls[0]?.[0] as {
        inputData: Record<string, unknown>;
        requestContext: { get: (k: string) => unknown };
      };
      expect(arg.inputData).toEqual({ taskId: '00000000-0000-0000-0000-000000000001' });
      expect(arg.requestContext.get('actor')).toEqual({ type: 'user', user_id: s.user_id });
      expect(arg.requestContext.get('tenant_id')).toBe(s.tenant_id);
      expect(arg.requestContext.get('role_summary')).toEqual(s.role_summary);
      // Row is projected synchronously so the inbox deep-link never 404s, even
      // before Mastra's async workflow.start pubsub event reaches the hook.
      const row = await pool.query(
        `SELECT workflow_id, tenant_id, started_by, started_via, status FROM copilot.workflow_runs WHERE run_id = $1`,
        [runId],
      );
      expect(row.rowCount).toBe(1);
      expect(row.rows[0]).toMatchObject({
        tenant_id: s.tenant_id,
        started_by: s.user_id,
        started_via: 'event',
        status: 'running',
      });
      // Stored under Mastra's intrinsic workflow id, not the REST alias, so
      // snapshot lookups and getPendingAssignRunIdForTask see the same id.
      expect((row.rows[0] as { workflow_id: string }).workflow_id).toBe('planner.assignBySkill');
    });
  });

  it('returns 401 when not authenticated', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const app = makeApp(null, makeMastra({}), pool);
      const res = await app.request('/api/copilot/v1/workflows/runs/assignBySkill/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: '00000000-0000-0000-0000-000000000001' }),
      });
      expect(res.status).toBe(401);
    });
  });

  it('returns 404 for an unknown workflow id', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const app = makeApp(session(), makeMastra({ unknownWorkflow: true }), pool);
      const res = await app.request('/api/copilot/v1/workflows/runs/nope/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(404);
    });
  });

  it('projects run-failed when the workflow start rejects, so the row never sticks in running', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const s = session();
      const runId = randomUUID();
      const start = vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('boom'), { code: 'compute_failed' }));
      const app = makeApp(s, makeMastra({ start, runId }), pool);
      const res = await app.request('/api/copilot/v1/workflows/runs/assignBySkill/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: '00000000-0000-0000-0000-000000000001' }),
      });
      expect(res.status).toBe(200);
      // Wait for the void-Promise catch + projection to flush.
      await new Promise((r) => setTimeout(r, 50));
      const row = await pool.query(
        `SELECT status, error_summary FROM copilot.workflow_runs WHERE run_id = $1`,
        [runId],
      );
      expect(row.rows[0]?.status).toBe('failed');
      expect(row.rows[0]?.error_summary).toBe('compute_failed: boom');
    });
  });

  it('returns 400 when the caller smuggles a session field in the body', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const start = vi.fn();
      const app = makeApp(session(), makeMastra({ start }), pool);
      const res = await app.request('/api/copilot/v1/workflows/runs/assignBySkill/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: '00000000-0000-0000-0000-000000000001',
          session: { tenantId: 'attacker', userId: 'attacker' },
        }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('invalid_input');
      expect(start).not.toHaveBeenCalled();
    });
  });
});
