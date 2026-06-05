import { randomUUID } from 'node:crypto';
import type { Mastra } from '@mastra/core';
import { AgentRegistry, type WorkflowSpec } from '@seta/agent-sdk';
import type { OrchestrationEvent } from '@seta/shared-orchestration';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AgentRouteEnv } from '../../src/backend/routes.ts';
import { registerAgentRoutes } from '../../src/backend/routes.ts';
import type { SessionLike } from '../../src/backend/types.ts';
import { withAgentTestDb } from '../helpers.ts';

async function* stubOrchestration(): AsyncIterable<OrchestrationEvent> {
  yield { kind: 'final', result: { message: 'ok' } };
}

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
  const app = new Hono<AgentRouteEnv>();
  app.use('*', async (c, next) => {
    if (s) c.set('session', s);
    await next();
  });
  registerAgentRoutes(app, {
    chatOrchestration: () => stubOrchestration(),
    mastra,
    pool,
  });
  return app;
}

describe('POST /api/agent/v1/workflows/runs/:workflowId/start', () => {
  it('starts a workflow run with session derived from authenticated request', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const s = session();
      const start = vi.fn().mockResolvedValue(undefined);
      const runId = randomUUID();
      const app = makeApp(s, makeMastra({ start, runId }), pool);
      const res = await app.request('/api/agent/v1/workflows/runs/assignBySkill/start', {
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
        `SELECT workflow_id, tenant_id, started_by, started_via, status FROM agent.workflow_runs WHERE run_id = $1`,
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
    await withAgentTestDb(async ({ pool }) => {
      const app = makeApp(null, makeMastra({}), pool);
      const res = await app.request('/api/agent/v1/workflows/runs/assignBySkill/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: '00000000-0000-0000-0000-000000000001' }),
      });
      expect(res.status).toBe(401);
    });
  });

  it('returns 404 for an unknown workflow id', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const app = makeApp(session(), makeMastra({ unknownWorkflow: true }), pool);
      const res = await app.request('/api/agent/v1/workflows/runs/nope/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(404);
    });
  });

  it('projects run-failed when the workflow start rejects, so the row never sticks in running', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const s = session();
      const runId = randomUUID();
      const start = vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('boom'), { code: 'compute_failed' }));
      const app = makeApp(s, makeMastra({ start, runId }), pool);
      const res = await app.request('/api/agent/v1/workflows/runs/assignBySkill/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: '00000000-0000-0000-0000-000000000001' }),
      });
      expect(res.status).toBe(200);
      // Wait for the void-Promise catch + projection to flush.
      await new Promise((r) => setTimeout(r, 50));
      const row = await pool.query(
        `SELECT status, error_summary FROM agent.workflow_runs WHERE run_id = $1`,
        [runId],
      );
      expect(row.rows[0]?.status).toBe('failed');
      expect(row.rows[0]?.error_summary).toBe('compute_failed: boom');
    });
  });

  it('returns 400 when the caller smuggles a session field in the body', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const start = vi.fn();
      const app = makeApp(session(), makeMastra({ start }), pool);
      const res = await app.request('/api/agent/v1/workflows/runs/assignBySkill/start', {
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

  describe('dedupeKey enforcement', () => {
    afterEach(() => {
      AgentRegistry.__resetForTests();
    });

    function registerDedupeSpec(mastraId: string, existingRunId: string | null): void {
      const spec: WorkflowSpec = {
        domain: 'work',
        id: 'assignBySkill',
        description: 'test',
        inputSchema: z.object({ taskId: z.string() }),
        outputSchema: z.object({}),
        workflow: { id: mastraId },
        dedupeKey: async () => existingRunId,
      };
      AgentRegistry.registerWorkflow(spec);
      AgentRegistry.freeze();
    }

    it('returns the in-flight runId without creating a new run when dedupeKey resolves', async () => {
      await withAgentTestDb(async ({ pool }) => {
        const existingRunId = randomUUID();
        registerDedupeSpec('planner.assignBySkill', existingRunId);
        const s = session();
        const start = vi.fn().mockResolvedValue(undefined);
        const createRun = vi.fn();
        const mastra = {
          getWorkflow: () => ({ id: 'planner.assignBySkill', createRun }),
        } as unknown as Mastra;
        // Wire createRun separately so we can assert it wasn't called.
        createRun.mockResolvedValue({ runId: randomUUID(), start });
        const app = makeApp(s, mastra, pool);

        const res = await app.request('/api/agent/v1/workflows/runs/assignBySkill/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: '00000000-0000-0000-0000-000000000001' }),
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ runId: existingRunId });
        expect(createRun).not.toHaveBeenCalled();
        expect(start).not.toHaveBeenCalled();
        // No new workflow_runs row projected for the dedupe-short-circuited request.
        const rows = await pool.query(
          `SELECT count(*)::int AS n FROM agent.workflow_runs WHERE tenant_id = $1`,
          [s.tenant_id],
        );
        expect(rows.rows[0]?.n).toBe(0);
      });
    });

    it('starts a fresh run when dedupeKey resolves to null', async () => {
      await withAgentTestDb(async ({ pool }) => {
        registerDedupeSpec('planner.assignBySkill', null);
        const s = session();
        const runId = randomUUID();
        const start = vi.fn().mockResolvedValue(undefined);
        const app = makeApp(s, makeMastra({ start, runId }), pool);

        const res = await app.request('/api/agent/v1/workflows/runs/assignBySkill/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: '00000000-0000-0000-0000-000000000001' }),
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ runId });
        expect(start).toHaveBeenCalledTimes(1);
      });
    });
  });
});
