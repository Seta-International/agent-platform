import { randomUUID } from 'node:crypto';
import type { Mastra } from '@mastra/core';
import type { ApprovalCard } from '@seta/agent-sdk';
import type { OrchestrationEvent } from '@seta/shared-orchestration';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { writeChatApprovalRow } from '../../src/backend/domain/write-chat-approval-row.ts';
import type { AgentRouteEnv } from '../../src/backend/routes.ts';
import { registerAgentRoutes } from '../../src/backend/routes.ts';
import type { SessionLike } from '../../src/backend/types.ts';
import { onLifecycleEvent } from '../../src/backend/workflows/_infra/lifecycle-hook.ts';
import { withAgentTestDb } from '../helpers.ts';

async function* stubOrchestration(): AsyncIterable<OrchestrationEvent> {
  yield { kind: 'final', result: { message: 'ok' } };
}

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
): Hono<AgentRouteEnv> {
  const app = new Hono<AgentRouteEnv>();
  app.use('*', async (c, next) => {
    if (s) c.set('session', s);
    await next();
  });
  registerAgentRoutes(app, {
    chatOrchestration: () => stubOrchestration(),
    mastra,
    pool,
    // Tests don't go through the real lifecycle wiring, so nothing is ever
    // enqueued; a no-op drain() preserves the production response contract.
    drainer: { drain: async () => {} } as never,
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
      runId: args.runId,
      eventSeq: 2,
      workflowId: 'agent.x',
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

describe('GET /api/agent/v1/workflows/runs', () => {
  it('returns runs scoped to self', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = session(['agent.workflow.run.read.self']);
      const runId = randomUUID();
      await seed(pool, { runId, tenantId: me.tenant_id, startedBy: me.user_id });
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request('/api/agent/v1/workflows/runs?scope=self');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { rows: { runId: string }[]; nextCursor: string | null };
      expect(body.rows[0]?.runId).toBe(runId);
    });
  });

  it('401 without session', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const app = makeApp(null, makeMastra(vi.fn()), pool);
      const res = await app.request('/api/agent/v1/workflows/runs');
      expect(res.status).toBe(401);
    });
  });

  it('403 when scope=tenant but caller lacks read.tenant', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = session(['agent.workflow.run.read.self']);
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request('/api/agent/v1/workflows/runs?scope=tenant');
      expect(res.status).toBe(403);
    });
  });
});

describe('GET /api/agent/v1/workflows/runs/:runId', () => {
  it('200 own run', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = session(['agent.workflow.run.read.self']);
      const runId = randomUUID();
      await seed(pool, { runId, tenantId: me.tenant_id, startedBy: me.user_id });
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request(`/api/agent/v1/workflows/runs/${runId}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { runId: string };
      expect(body.runId).toBe(runId);
    });
  });

  it('404 invisible run', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = session(['agent.workflow.run.read.self']);
      const runId = randomUUID();
      await seed(pool, { runId, tenantId: randomUUID(), startedBy: randomUUID() });
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request(`/api/agent/v1/workflows/runs/${runId}`);
      expect(res.status).toBe(404);
    });
  });
});

describe('GET /api/agent/v1/workflows/my-pending-approvals', () => {
  it('returns my pending approvals', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = session(['agent.workflow.run.read.self']);
      const runId = randomUUID();
      await seed(pool, { runId, tenantId: me.tenant_id, startedBy: me.user_id, suspended: true });
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request('/api/agent/v1/workflows/my-pending-approvals');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { approvalId: string }[];
      expect(body).toHaveLength(1);
    });
  });
});

describe('POST /api/agent/v1/workflows/approvals/:id/decide', () => {
  it('decides and returns { runId, resumed }', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = session(['agent.workflow.run.read.self', 'agent.workflow.approve']);
      const runId = randomUUID();
      await seed(pool, { runId, tenantId: me.tenant_id, startedBy: me.user_id, suspended: true });
      const approvalId = (
        await pool.query<{ approval_id: string }>(
          `SELECT approval_id FROM agent.workflow_approvals WHERE run_id = $1`,
          [runId],
        )
      ).rows[0]!.approval_id;

      const resume = vi.fn().mockResolvedValue(undefined);
      const app = makeApp(me, makeMastra(resume), pool);
      const res = await app.request(`/api/agent/v1/workflows/approvals/${approvalId}/decide`, {
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
    await withAgentTestDb(async ({ pool }) => {
      const me = session(['agent.workflow.approve']);
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request(`/api/agent/v1/workflows/approvals/${randomUUID()}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'bogus' }),
      });
      expect(res.status).toBe(400);
    });
  });

  it('403 when caller lacks agent.workflow.approve', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = session(['agent.workflow.run.read.self']);
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request(`/api/agent/v1/workflows/approvals/${randomUUID()}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'approve' }),
      });
      expect(res.status).toBe(403);
    });
  });
});

describe('POST /api/agent/v1/workflows/runs/:runId/rerun', () => {
  it('reruns and returns { newRunId }', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = session(['agent.workflow.run.read.self', 'agent.workflow.run.execute.self']);
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
      const res = await app.request(`/api/agent/v1/workflows/runs/${runId}/rerun`, {
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

describe('POST /api/agent/v1/workflows/runs/:runId/replay-from-step', () => {
  it('returns 200 with newRunId on happy path', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = session(['agent.workflow.run.read.self', 'agent.workflow.run.execute.self']);
      const runId = randomUUID();
      await seed(pool, { runId, tenantId: me.tenant_id, startedBy: me.user_id });
      const timeTravel = vi.fn().mockResolvedValue({ status: 'success' });
      const mastra = {
        getWorkflow: () => ({
          createRun: async ({ runId: r }: { runId?: string } = {}) => ({
            runId: r ?? randomUUID(),
            timeTravel,
          }),
        }),
      } as unknown as Mastra;
      const app = makeApp(me, mastra, pool);
      const res = await app.request(`/api/agent/v1/workflows/runs/${runId}/replay-from-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId: 'b', payload: { x: 2 } }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { newRunId: string };
      expect(body.newRunId).toBe(runId);
      expect(timeTravel).toHaveBeenCalledWith(
        expect.objectContaining({ step: ['b'], inputData: { x: 2 } }),
      );
    });
  });

  it('returns 400 on missing stepId', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = session(['agent.workflow.run.read.self', 'agent.workflow.run.execute.self']);
      const runId = randomUUID();
      await seed(pool, { runId, tenantId: me.tenant_id, startedBy: me.user_id });
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request(`/api/agent/v1/workflows/runs/${runId}/replay-from-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: {} }),
      });
      expect(res.status).toBe(400);
    });
  });

  it('returns 401 without a session', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const app = makeApp(null, makeMastra(vi.fn()), pool);
      const res = await app.request(
        `/api/agent/v1/workflows/runs/${randomUUID()}/replay-from-step`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stepId: 'b' }),
        },
      );
      expect(res.status).toBe(401);
    });
  });
});

describe('POST /api/agent/v1/workflows/runs/:runId/cancel', () => {
  it('returns 200 and publishes workflow.cancel for own running run', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = session(['agent.workflow.run.read.self', 'agent.workflow.run.cancel.self']);
      const runId = randomUUID();
      await seed(pool, { runId, tenantId: me.tenant_id, startedBy: me.user_id });
      const publish = vi.fn().mockResolvedValue(undefined);
      const mastra = { pubsub: { publish } } as unknown as Mastra;
      const app = makeApp(me, mastra, pool);
      const res = await app.request(`/api/agent/v1/workflows/runs/${runId}/cancel`, {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      expect(publish).toHaveBeenCalledWith(
        'workflows',
        expect.objectContaining({ type: 'workflow.cancel', runId }),
      );
    });
  });

  it('returns 403 when caller lacks any cancel permission', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = session(['agent.workflow.run.read.self']);
      const runId = randomUUID();
      await seed(pool, { runId, tenantId: me.tenant_id, startedBy: me.user_id });
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request(`/api/agent/v1/workflows/runs/${runId}/cancel`, {
        method: 'POST',
      });
      expect(res.status).toBe(403);
    });
  });

  it('returns 401 without a session', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const app = makeApp(null, makeMastra(vi.fn()), pool);
      const res = await app.request(`/api/agent/v1/workflows/runs/${randomUUID()}/cancel`, {
        method: 'POST',
      });
      expect(res.status).toBe(401);
    });
  });
});

describe('GET /api/agent/v1/workflows/sse-token', () => {
  it('returns a token', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = session(['agent.workflow.run.read.self']);
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request('/api/agent/v1/workflows/sse-token');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { token: string };
      expect(body.token.length).toBeGreaterThan(10);
    });
  });
});

describe('GET /api/agent/v1/workflows/definitions', () => {
  it('returns 401 without a session', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const app = makeApp(null, makeMastra(vi.fn()), pool);
      const res = await app.request('/api/agent/v1/workflows/definitions');
      expect(res.status).toBe(401);
    });
  });

  it('returns the registered workflows from the AgentRegistry snapshot', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { AgentRegistry } = await import('@seta/agent-sdk');
      const { z } = await import('zod');
      AgentRegistry.__resetForTests();
      AgentRegistry.registerWorkflow({
        domain: 'work',
        id: 'routes-test-wf',
        description: 'A test workflow.',
        inputSchema: z.object({ taskId: z.string().uuid() }),
        outputSchema: z.object({ ok: z.boolean() }),
        workflow: {},
        hitlSteps: ['s1'],
      });
      AgentRegistry.freeze();
      try {
        const me = session(['agent.workflow.run.read.self']);
        const app = makeApp(me, makeMastra(vi.fn()), pool);
        const res = await app.request('/api/agent/v1/workflows/definitions');
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          rows: Array<{ id: string; domain: string; description: string; hitlSteps: string[] }>;
        };
        expect(body.rows).toContainEqual({
          id: 'routes-test-wf',
          domain: 'work',
          description: 'A test workflow.',
          hitlSteps: ['s1'],
        });
      } finally {
        AgentRegistry.__resetForTests();
      }
    });
  });
});

describe('GET /api/agent/v1/workflows/:workflowId/input-schema', () => {
  it('returns 401 without a session', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const app = makeApp(null, makeMastra(vi.fn()), pool);
      const res = await app.request(
        '/api/agent/v1/workflows/agent.new-task-skill-tag/input-schema',
      );
      expect(res.status).toBe(401);
    });
  });

  it('returns the JSON Schema for a registered workflow', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { registerWorkflowInputSchema } = await import(
        '../../src/backend/workflows/_infra/input-schema-registry.ts'
      );
      const { z } = await import('zod');
      registerWorkflowInputSchema(
        'agent.routes-test-workflow',
        z.object({ taskId: z.string().uuid() }),
      );
      const me = session(['agent.workflow.run.read.self']);
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request(
        '/api/agent/v1/workflows/agent.routes-test-workflow/input-schema',
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        type: string;
        properties: { taskId: { format: string } };
      };
      expect(body.type).toBe('object');
      expect(body.properties.taskId.format).toBe('uuid');
    });
  });

  it('returns 404 for an unknown workflow id', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = session(['agent.workflow.run.read.self']);
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request('/api/agent/v1/workflows/agent.no-such-workflow/input-schema');
      expect(res.status).toBe(404);
    });
  });
});

function hitlCard(tenantId: string, userId: string): ApprovalCard {
  const taskId = randomUUID();
  return {
    toolCallId: `staffing-orchestrator:${taskId}`,
    intent: 'Assign "AWS migration"',
    riskBadge: 'write',
    summary: 'Top match: Alice (1 skill(s) matched, available).',
    details: [
      {
        kind: 'candidateList',
        items: [{ id: 'u1', label: 'Alice', secondary: 'skills: aws · available', score: 0.9 }],
      },
    ],
    primary: {
      label: 'Assign to Alice',
      argsPatch: { action: 'assign', assigneeUserIds: ['u1'], taskId },
    },
    alternates: [],
    decline: { label: 'Leave unassigned' },
    meta: {
      tenantId,
      userId,
      agentPath: ['staffing', 'orchestrator'],
      toolId: 'planner_proposeAssignment',
      ts: new Date().toISOString(),
    },
  };
}

describe('GET /api/agent/v1/workflows/threads/:threadId/approvals', () => {
  it('returns the thread approvals including decision fields', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = session(['agent.workflow.run.read.self']);
      await writeChatApprovalRow({
        card: hitlCard(me.tenant_id, me.user_id),
        mastraRunId: randomUUID(),
        toolCallId: randomUUID(),
        tenantId: me.tenant_id,
        userId: me.user_id,
        threadId: 'thread-1',
        pool,
      });
      const app = makeApp(me, makeMastra(vi.fn()), pool);
      const res = await app.request('/api/agent/v1/workflows/threads/thread-1/approvals');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        approvalId: string;
        status: string;
        decisionPayload: unknown;
        decidedAt: string | null;
      }[];
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({ status: 'pending', decisionPayload: null, decidedAt: null });
    });
  });

  it('401 without session', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const app = makeApp(null, makeMastra(vi.fn()), pool);
      const res = await app.request('/api/agent/v1/workflows/threads/thread-1/approvals');
      expect(res.status).toBe(401);
    });
  });
});
