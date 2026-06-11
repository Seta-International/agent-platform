import { randomUUID } from 'node:crypto';
import { ReadableStream } from 'node:stream/web';
import type { ChatStreamRun } from '@seta/shared-orchestration';
import { Hono } from 'hono';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { registerAgentRoutes } from '../../src/backend/routes.ts';
import { withAgentTestDb } from '../helpers.ts';

const TRUST = { reasoningTrace: [], evidenceCitations: [], confidenceScore: 0.8 };

function fakeOutput(textChunks: string[] = []) {
  const chunks: unknown[] = [];
  if (textChunks.length) {
    chunks.push({ type: 'text-start', runId: 'r', from: 'AGENT', payload: { id: 't' } });
    for (const t of textChunks) {
      chunks.push({ type: 'text-delta', runId: 'r', from: 'AGENT', payload: { id: 't', text: t } });
    }
    chunks.push({ type: 'text-end', runId: 'r', from: 'AGENT', payload: { id: 't' } });
  }
  chunks.push({
    type: 'finish',
    runId: 'r',
    from: 'AGENT',
    payload: { stepResult: { reason: 'stop' }, output: { usage: {} } },
  });
  return {
    fullStream: new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(c);
        controller.close();
      },
    }),
  };
}

function fakeChatRun(opts: { text?: string[]; result?: unknown } = {}): ChatStreamRun {
  return {
    output: fakeOutput(opts.text) as unknown as ChatStreamRun['output'],
    finalize: async () => ({ result: opts.result ?? { message: 'assigned' }, trust: TRUST }),
  };
}

type TestSession = {
  tenant_id: string;
  user_id: string;
  effective_permissions: ReadonlySet<string>;
  role_summary: { roles: string[]; cross_tenant_read: boolean };
};

const fakeMastra = { getStorage: () => null } as never;
const fakePool = {
  connect: async () => {
    throw new Error('no pool in route handler');
  },
} as unknown as Pool;

function makeCard(assigneeUserIds: string[], taskId: string) {
  return {
    toolCallId: 'tc-card',
    intent: 'Assign task',
    riskBadge: 'write' as const,
    summary: 'top match',
    details: [],
    primary: {
      label: 'Assign',
      argsPatch: { action: 'assign', assigneeUserIds, taskId },
    },
    alternates: [
      {
        label: 'Alt',
        argsPatch: { action: 'assign', assigneeUserIds: ['alt-1'], taskId },
      },
    ],
    decline: { label: 'Leave unassigned', argsPatch: { action: 'leave-unassigned' } },
    meta: {
      tenantId: 't',
      userId: 'u',
      agentPath: ['staffing.orchestrator'],
      toolId: 'proposeAssignment',
      ts: new Date().toISOString(),
    },
  };
}

/** Inserts an agentic native-suspend approval row (carries mastra_run_id +
 *  tool_call_id) and returns the approval id. */
async function seedAgenticApproval(
  pool: Pool,
  args: {
    tenantId: string;
    approverUserId: string;
    mastraRunId: string;
    toolCallId: string;
    threadId: string;
    card: ReturnType<typeof makeCard>;
  },
): Promise<{ approvalId: string; runId: string }> {
  const runId = randomUUID();
  await pool.query(
    `INSERT INTO agent.workflow_runs
       (run_id, workflow_id, tenant_id, started_by, started_via, input_summary, status, started_at)
     VALUES ($1, 'staffing.orchestrator', $2, $3, 'chat', '{}'::jsonb, 'paused', now())`,
    [runId, args.tenantId, args.approverUserId],
  );
  const approvalId = randomUUID();
  await pool.query(
    `INSERT INTO agent.workflow_approvals
       (approval_id, run_id, step_id, proposed_payload, approver_user_id,
        fallback_approver_user_id, surface_canvas, surface_chat_thread_id,
        mastra_run_id, tool_call_id, status, expires_at, created_at)
     VALUES ($1, $2, 'chat-hitl', $3::jsonb, $4, NULL, false, $5,
             $6, $7, 'pending', now() + interval '1 day', now())`,
    [
      approvalId,
      runId,
      JSON.stringify(args.card),
      args.approverUserId,
      args.threadId,
      args.mastraRunId,
      args.toolCallId,
    ],
  );
  return { approvalId, runId };
}

type CapturedResume = {
  resume: {
    decision: string;
    overrideUserIds?: string[];
    alternateIndices?: number[];
    note?: string;
  };
  ctx: { mastraRunId: string; toolCallId?: string; threadId?: string };
};

/** Fake resumeOrchestration that records (resume, ctx) and yields a final event.
 *  The agent test must not depend on staffing. */
function makeFakeResume(captured: CapturedResume[]) {
  return async (
    resume: CapturedResume['resume'],
    ctx: { mastraRunId: string; toolCallId?: string; threadId?: string },
  ): Promise<ChatStreamRun> => {
    captured.push({ resume, ctx });
    return fakeChatRun();
  };
}

function buildApp(
  session: TestSession | null,
  resumeOrchestration: ReturnType<typeof makeFakeResume>,
): Hono<{ Variables: { session: TestSession } }> {
  const app = new Hono<{ Variables: { session: TestSession } }>();
  if (session) {
    app.use('*', async (c, next) => {
      c.set('session', session);
      await next();
    });
  }
  registerAgentRoutes(app, {
    mastra: fakeMastra,
    pool: fakePool,
    chatOrchestration: async () => fakeChatRun(),
    resumeOrchestration,
  });
  return app;
}

function sessionWith(tenantId: string, userId: string, perms: string[]): TestSession {
  return {
    tenant_id: tenantId,
    user_id: userId,
    effective_permissions: new Set(perms),
    role_summary: { roles: [], cross_tenant_read: false },
  };
}

async function outboxCount(pool: Pool, runId: string): Promise<number> {
  const r = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM core.events
      WHERE aggregate_id = $1 AND event_type = 'agent.workflow.approval.decided'`,
    [runId],
  );
  return Number(r.rows[0]!.n);
}

describe('POST /api/agent/v1/chat/resume', () => {
  it('approve: records decision + outbox, resumes with overrideUserIds from primary card', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const me = sessionWith(tenantId, userId, ['agent.workflow.approve']);
      const threadId = randomUUID();
      const mastraRunId = randomUUID();
      const card = makeCard(['u1'], randomUUID());
      const { approvalId, runId } = await seedAgenticApproval(pool, {
        tenantId,
        approverUserId: userId,
        mastraRunId,
        toolCallId: 'tc-1',
        threadId,
        card,
      });

      const captured: CapturedResume[] = [];
      const app = buildApp(me, makeFakeResume(captured));
      const res = await app.request('/api/agent/v1/chat/resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approvalId, decision: 'approve' }),
      });
      expect(res.status).toBe(200);
      await res.text(); // drain the SSE so execute() runs to completion

      // decision recorded
      const row = await pool.query<{ status: string; decided_by: string }>(
        `SELECT status, decided_by FROM agent.workflow_approvals WHERE approval_id = $1`,
        [approvalId],
      );
      expect(row.rows[0]!.status).toBe('approved');
      expect(row.rows[0]!.decided_by).toBe(userId);

      // outbox written
      expect(await outboxCount(pool, runId)).toBe(1);

      // resume called with override from primary card + ctx coordinates
      expect(captured).toHaveLength(1);
      expect(captured[0]!.resume).toEqual({ decision: 'approve', overrideUserIds: ['u1'] });
      expect(captured[0]!.ctx.mastraRunId).toBe(mastraRunId);
      expect(captured[0]!.ctx.toolCallId).toBe('tc-1');
      expect(captured[0]!.ctx.threadId).toBe(threadId);
    });
  });

  it('reject: records decision + outbox, resumes with reject and no override', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const me = sessionWith(tenantId, userId, ['agent.workflow.approve']);
      const { approvalId, runId } = await seedAgenticApproval(pool, {
        tenantId,
        approverUserId: userId,
        mastraRunId: randomUUID(),
        toolCallId: 'tc-2',
        threadId: randomUUID(),
        card: makeCard(['u1'], randomUUID()),
      });

      const captured: CapturedResume[] = [];
      const app = buildApp(me, makeFakeResume(captured));
      const res = await app.request('/api/agent/v1/chat/resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approvalId, decision: 'reject' }),
      });
      expect(res.status).toBe(200);
      await res.text();

      const row = await pool.query<{ status: string }>(
        `SELECT status FROM agent.workflow_approvals WHERE approval_id = $1`,
        [approvalId],
      );
      expect(row.rows[0]!.status).toBe('rejected');
      expect(await outboxCount(pool, runId)).toBe(1);
      expect(captured[0]!.resume).toEqual({ decision: 'reject' });
    });
  });

  it('cross-tenant caller: 403, no decision recorded, no resume call', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const ownerTenant = randomUUID();
      const ownerUser = randomUUID();
      const { approvalId, runId } = await seedAgenticApproval(pool, {
        tenantId: ownerTenant,
        approverUserId: ownerUser,
        mastraRunId: randomUUID(),
        toolCallId: 'tc-3',
        threadId: randomUUID(),
        card: makeCard(['u1'], randomUUID()),
      });

      // Attacker has the permission + step-in capability but is in another tenant.
      const attacker = sessionWith(randomUUID(), randomUUID(), [
        'agent.workflow.approve',
        'agent.workflow.run.read.tenant',
      ]);
      const captured: CapturedResume[] = [];
      const app = buildApp(attacker, makeFakeResume(captured));
      const res = await app.request('/api/agent/v1/chat/resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approvalId, decision: 'approve' }),
      });
      expect(res.status).toBe(403);

      const row = await pool.query<{ status: string }>(
        `SELECT status FROM agent.workflow_approvals WHERE approval_id = $1`,
        [approvalId],
      );
      expect(row.rows[0]!.status).toBe('pending');
      expect(await outboxCount(pool, runId)).toBe(0);
      expect(captured).toHaveLength(0);
    });
  });

  it('non-approver in same tenant: 403, no resume call', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const owner = randomUUID();
      const { approvalId, runId } = await seedAgenticApproval(pool, {
        tenantId,
        approverUserId: owner,
        mastraRunId: randomUUID(),
        toolCallId: 'tc-4',
        threadId: randomUUID(),
        card: makeCard(['u1'], randomUUID()),
      });
      // Same tenant, has approve perm, but NOT the approver and no step-in
      // (surface_canvas=false on this row).
      const stranger = sessionWith(tenantId, randomUUID(), [
        'agent.workflow.approve',
        'agent.workflow.run.read.tenant',
      ]);
      const captured: CapturedResume[] = [];
      const app = buildApp(stranger, makeFakeResume(captured));
      const res = await app.request('/api/agent/v1/chat/resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approvalId, decision: 'approve' }),
      });
      expect(res.status).toBe(403);
      expect(await outboxCount(pool, runId)).toBe(0);
      expect(captured).toHaveLength(0);
    });
  });

  it('caller lacking agent.workflow.approve: 403 before recording', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const { approvalId } = await seedAgenticApproval(pool, {
        tenantId,
        approverUserId: userId,
        mastraRunId: randomUUID(),
        toolCallId: 'tc-5',
        threadId: randomUUID(),
        card: makeCard(['u1'], randomUUID()),
      });
      const me = sessionWith(tenantId, userId, ['agent.chat.use']);
      const captured: CapturedResume[] = [];
      const app = buildApp(me, makeFakeResume(captured));
      const res = await app.request('/api/agent/v1/chat/resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approvalId, decision: 'approve' }),
      });
      expect(res.status).toBe(403);
      expect(captured).toHaveLength(0);
    });
  });

  it('already-decided approval: 409', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const me = sessionWith(tenantId, userId, ['agent.workflow.approve']);
      const { approvalId } = await seedAgenticApproval(pool, {
        tenantId,
        approverUserId: userId,
        mastraRunId: randomUUID(),
        toolCallId: 'tc-6',
        threadId: randomUUID(),
        card: makeCard(['u1'], randomUUID()),
      });
      const captured: CapturedResume[] = [];
      const app = buildApp(me, makeFakeResume(captured));
      const body = JSON.stringify({ approvalId, decision: 'approve' });
      const first = await app.request('/api/agent/v1/chat/resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      expect(first.status).toBe(200);
      await first.text();
      const second = await app.request('/api/agent/v1/chat/resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      expect(second.status).toBe(409);
    });
  });

  it('non-agentic (evented) row: 409 not_resumable, NO decision recorded, no resume call', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const me = sessionWith(tenantId, userId, ['agent.workflow.approve']);
      // An evented/canvas approval has mastra_run_id NULL — submitting it to
      // /chat/resume must be rejected INSIDE the transaction (no half-write).
      const runId = randomUUID();
      await pool.query(
        `INSERT INTO agent.workflow_runs
           (run_id, workflow_id, tenant_id, started_by, started_via, input_summary, status, started_at)
         VALUES ($1, 'planner.assignBySkill', $2, $3, 'api', '{}'::jsonb, 'paused', now())`,
        [runId, tenantId, userId],
      );
      const approvalId = randomUUID();
      await pool.query(
        `INSERT INTO agent.workflow_approvals
           (approval_id, run_id, step_id, proposed_payload, approver_user_id,
            fallback_approver_user_id, surface_canvas, surface_chat_thread_id,
            mastra_run_id, tool_call_id, status, expires_at, created_at)
         VALUES ($1, $2, 'assignBySkill.suggest', $3::jsonb, $4, NULL, true, NULL,
                 NULL, NULL, 'pending', now() + interval '1 day', now())`,
        [approvalId, runId, JSON.stringify(makeCard(['u1'], randomUUID())), userId],
      );
      const captured: CapturedResume[] = [];
      const app = buildApp(me, makeFakeResume(captured));
      const res = await app.request('/api/agent/v1/chat/resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approvalId, decision: 'approve' }),
      });
      expect(res.status).toBe(409);
      // Pre-commit guard: the decision was NOT recorded and nothing was emitted.
      const row = await pool.query<{ status: string }>(
        `SELECT status FROM agent.workflow_approvals WHERE approval_id = $1`,
        [approvalId],
      );
      expect(row.rows[0]!.status).toBe('pending');
      expect(await outboxCount(pool, runId)).toBe(0);
      expect(captured).toHaveLength(0);
    });
  });
});
