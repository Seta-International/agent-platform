import { randomUUID } from 'node:crypto';
import { ReadableStream } from 'node:stream/web';
import type { ChatStreamRun } from '@seta/shared-orchestration';
import { Hono } from 'hono';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { registerAgentRoutes } from '../../src/backend/routes.ts';
import { sweepWorkflowApprovals } from '../../src/backend/workflows/_infra/sweeper.ts';
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
  role_summary: {
    roles: string[];
    cross_tenant_read: boolean;
    assignments: ReadonlyArray<{
      role_slug: string;
      scope_kind: 'tenant' | 'org_unit' | 'self';
      scope_id: string | null;
    }>;
  };
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
      argsPatch: { action: 'assign', assigneeUserIds, taskId, idempotencyKey: 'key-1' },
    },
    alternates: [
      {
        label: 'Alt',
        argsPatch: {
          action: 'assign',
          assigneeUserIds: ['alt-1'],
          taskId,
          idempotencyKey: 'key-1',
        },
      },
    ],
    decline: {
      label: 'Leave unassigned',
      argsPatch: { action: 'decline', taskId, idempotencyKey: 'key-1' },
    },
    meta: {
      tenantId: 't',
      userId: 'u',
      agentPath: ['planner.assignment-orchestrator'],
      toolId: 'proposeAssignment',
      dedupKey: `assign:${taskId}`,
      ts: new Date().toISOString(),
    },
  };
}

/** The shape buildUpdateApprovalCard emits: an A2 update preview. Its argsPatch
 *  carries everything the resumed tool needs, because the resume may run in a
 *  different process than the turn that created it. */
function makeActionCard(taskId: string) {
  return {
    toolCallId: `planner.action:${taskId}`,
    intent: 'Update "AWS migration"',
    riskBadge: 'write' as const,
    summary: 'Due will change.',
    details: [
      { kind: 'kvTable', rows: [{ k: 'Due', v: '12 Aug 2026 23:59 → 15 Aug 2026 23:59' }] },
    ],
    primary: {
      label: 'Apply the change',
      argsPatch: {
        action: 'update',
        taskId,
        patch: { due_at: '2026-08-15T16:59:00.000Z' },
        expectedVersion: 4,
        idempotencyKey: 'key-1',
      },
    },
    alternates: [],
    decline: {
      label: 'Cancel',
      argsPatch: { action: 'decline', taskId, expectedVersion: 4, idempotencyKey: 'key-1' },
    },
    meta: {
      tenantId: 't',
      userId: 'u',
      agentPath: ['action', 'orchestrator'],
      toolId: 'planner_updateTask',
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
    card: ReturnType<typeof makeCard> | ReturnType<typeof makeActionCard>;
    /** The runtime that owns the card. /chat/resume dispatches on this, so it is
     *  what decides which body contract the request must use. */
    workflowId?: string;
  },
): Promise<{ approvalId: string; runId: string }> {
  const runId = randomUUID();
  await pool.query(
    `INSERT INTO agent.workflow_runs
       (run_id, workflow_id, tenant_id, started_by, started_via, input_summary, status, started_at)
     VALUES ($1, $4, $2, $3, 'chat', '{}'::jsonb, 'paused', now())`,
    [
      runId,
      args.tenantId,
      args.approverUserId,
      args.workflowId ?? 'planner.assignment-orchestrator',
    ],
  );
  const approvalId = randomUUID();
  await pool.query(
    `INSERT INTO agent.workflow_approvals
       (approval_id, run_id, tenant_id, step_id, proposed_payload, approver_user_id,
        fallback_approver_user_id, surface_canvas, surface_chat_thread_id,
        mastra_run_id, tool_call_id, status, expires_at, created_at)
     VALUES ($1, $2, (SELECT tenant_id FROM agent.workflow_runs WHERE run_id = $2),
             'chat-hitl', $3::jsonb, $4, NULL, false, $5,
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
  /** Payload-agnostic: the legacy path forwards a decision object, the generic
   *  path forwards the card's argsPatch verbatim. */
  resume: Record<string, unknown>;
  ctx: { mastraRunId: string; toolCallId?: string; threadId?: string; workflowId: string };
};

/** Fake resumeOrchestration that records (resume, ctx) and yields a final event.
 *  The agent test must not depend on staffing. */
function makeFakeResume(captured: CapturedResume[]) {
  return async (
    resume: CapturedResume['resume'],
    ctx: CapturedResume['ctx'],
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
    role_summary: { roles: [], cross_tenant_read: false, assignments: [] },
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

const post = (
  app: Hono<{ Variables: { session: TestSession } }>,
  body: unknown,
): Promise<Response> =>
  app.request('/api/agent/v1/chat/resume', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const statusOf = (pool: Pool, approvalId: string): Promise<string> =>
  pool
    .query<{ status: string }>(
      'SELECT status FROM agent.workflow_approvals WHERE approval_id = $1',
      [approvalId],
    )
    .then((r) => r.rows[0]!.status);

describe('POST /api/agent/v1/chat/resume', () => {
  it('approve: records decision + outbox, resumes with the primary branch verbatim', async () => {
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
        body: JSON.stringify({ approvalId, chosen: 'primary' }),
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

      // resume called with the primary branch's argsPatch + ctx coordinates
      expect(captured).toHaveLength(1);
      expect(captured[0]!.resume).toEqual({
        action: 'assign',
        assigneeUserIds: ['u1'],
        taskId: card.primary.argsPatch.taskId,
        idempotencyKey: 'key-1',
      });
      expect(captured[0]!.ctx.mastraRunId).toBe(mastraRunId);
      expect(captured[0]!.ctx.toolCallId).toBe('tc-1');
      expect(captured[0]!.ctx.threadId).toBe(threadId);
    });
  });

  it('decline: records decision + outbox, resumes with the decline branch', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const me = sessionWith(tenantId, userId, ['agent.workflow.approve']);
      const declineTaskId = randomUUID();
      const { approvalId, runId } = await seedAgenticApproval(pool, {
        tenantId,
        approverUserId: userId,
        mastraRunId: randomUUID(),
        toolCallId: 'tc-2',
        threadId: randomUUID(),
        card: makeCard(['u1'], declineTaskId),
      });

      const captured: CapturedResume[] = [];
      const app = buildApp(me, makeFakeResume(captured));
      const res = await app.request('/api/agent/v1/chat/resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approvalId, chosen: 'decline' }),
      });
      expect(res.status).toBe(200);
      await res.text();

      const row = await pool.query<{ status: string }>(
        `SELECT status FROM agent.workflow_approvals WHERE approval_id = $1`,
        [approvalId],
      );
      expect(row.rows[0]!.status).toBe('rejected');
      expect(await outboxCount(pool, runId)).toBe(1);
      expect(captured[0]!.resume).toEqual({
        action: 'decline',
        taskId: declineTaskId,
        idempotencyKey: 'key-1',
      });
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
        'agent.workflow.run.read',
      ]);
      const captured: CapturedResume[] = [];
      const app = buildApp(attacker, makeFakeResume(captured));
      const res = await app.request('/api/agent/v1/chat/resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approvalId, chosen: 'primary' }),
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
        'agent.workflow.run.read',
      ]);
      const captured: CapturedResume[] = [];
      const app = buildApp(stranger, makeFakeResume(captured));
      const res = await app.request('/api/agent/v1/chat/resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approvalId, chosen: 'primary' }),
      });
      expect(res.status).toBe(403);
      expect(await outboxCount(pool, runId)).toBe(0);
      expect(captured).toHaveLength(0);
      // EV-07: the card must survive a refused confirm as PENDING. A refusal that
      // consumed the row would leave the person actually entitled to confirm it
      // with nothing to press — a denial of service on somebody else's card,
      // reachable by anyone who knows an approval id.
      const row = await pool.query<{ status: string }>(
        `SELECT status FROM agent.workflow_approvals WHERE approval_id = $1`,
        [approvalId],
      );
      expect(row.rows[0]!.status).toBe('pending');
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
        body: JSON.stringify({ approvalId, chosen: 'primary' }),
      });
      expect(res.status).toBe(403);
      expect(captured).toHaveLength(0);
    });
  });

  // A CHANGED decision on a decided row is what 409s. Repeating the identical
  // decision re-resumes instead (FUT-815: recovery for a decision that committed
  // while its write did not) — covered by the same-decision replay suite below.
  it('already-decided approval, different decision: 409', async () => {
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
      const first = await post(app, { approvalId, chosen: 'primary' });
      expect(first.status).toBe(200);
      await first.text();
      const second = await post(app, { approvalId, chosen: 'decline' });
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
           (approval_id, run_id, tenant_id, step_id, proposed_payload, approver_user_id,
            fallback_approver_user_id, surface_canvas, surface_chat_thread_id,
            mastra_run_id, tool_call_id, status, expires_at, created_at)
         VALUES ($1, $2, (SELECT tenant_id FROM agent.workflow_runs WHERE run_id = $2),
                 'assignBySkill.suggest', $3::jsonb, $4, NULL, true, NULL,
                 NULL, NULL, 'pending', now() + interval '1 day', now())`,
        [approvalId, runId, JSON.stringify(makeCard(['u1'], randomUUID())), userId],
      );
      const captured: CapturedResume[] = [];
      const app = buildApp(me, makeFakeResume(captured));
      const res = await app.request('/api/agent/v1/chat/resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approvalId, chosen: 'primary' }),
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

describe('POST /api/agent/v1/chat/resume — same-decision replay', () => {
  it('re-resumes when the SAME decision is confirmed again on a still-paused run', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const me = sessionWith(tenantId, userId, ['agent.workflow.approve']);
      const { approvalId } = await seedAgenticApproval(pool, {
        tenantId,
        approverUserId: userId,
        mastraRunId: randomUUID(),
        toolCallId: 'tc-replay',
        threadId: randomUUID(),
        card: makeActionCard(randomUUID()),
        workflowId: 'planner.action',
      });
      const captured: CapturedResume[] = [];
      const app = buildApp(me, makeFakeResume(captured));

      const first = await post(app, { approvalId, chosen: 'primary' });
      expect(first.status).toBe(200);
      await first.text();

      // Same decision again → resumed again; the gateway makes the write idempotent.
      const second = await post(app, { approvalId, chosen: 'primary' });
      expect(second.status).toBe(200);
      await second.text();
      expect(captured).toHaveLength(2);

      // A DIFFERENT decision on a decided row is still refused.
      const third = await post(app, { approvalId, chosen: 'decline' });
      expect(third.status).toBe(409);
      expect(await third.json()).toMatchObject({ error: 'already_decided' });
    });
  });
});

/** Every test below asserts on the exact payload the route forwards, so each one
 *  builds the app with a recording resumeOrchestration. */
function appWithRecorder(): {
  app: Hono<{ Variables: { session: TestSession } }>;
  calls: CapturedResume[];
  tenantId: string;
  userId: string;
} {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const calls: CapturedResume[] = [];
  const app = buildApp(
    sessionWith(tenantId, userId, ['agent.workflow.approve']),
    makeFakeResume(calls),
  );
  return { app, calls, tenantId, userId };
}

async function seedFor(
  pool: Pool,
  at: { tenantId: string; userId: string },
  card: ReturnType<typeof makeCard> | ReturnType<typeof makeActionCard>,
  workflowId?: string,
): Promise<string> {
  const { approvalId } = await seedAgenticApproval(pool, {
    tenantId: at.tenantId,
    approverUserId: at.userId,
    mastraRunId: randomUUID(),
    toolCallId: `tc-${randomUUID().slice(0, 8)}`,
    threadId: randomUUID(),
    card,
    ...(workflowId ? { workflowId } : {}),
  });
  return approvalId;
}

describe('POST /api/agent/v1/chat/resume — generalized confirm', () => {
  it('generic round trip: a primary confirm forwards the card argsPatch verbatim', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const at = appWithRecorder();
      const taskId = randomUUID();
      const approvalId = await seedFor(pool, at, makeActionCard(taskId), 'planner.action');

      const res = await post(at.app, { approvalId, chosen: 'primary' });
      expect(res.status).toBe(200);
      await res.text();
      expect(at.calls[0]!.resume).toEqual({
        action: 'update',
        taskId,
        patch: { due_at: '2026-08-15T16:59:00.000Z' },
        expectedVersion: 4,
        idempotencyKey: 'key-1',
      });
      expect(at.calls[0]!.ctx.workflowId).toBe('planner.action');
    });
  });

  it('a decline forwards the decline argsPatch and carries no patch', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const at = appWithRecorder();
      const taskId = randomUUID();
      const approvalId = await seedFor(pool, at, makeActionCard(taskId), 'planner.action');

      const res = await post(at.app, { approvalId, chosen: 'decline' });
      expect(res.status).toBe(200);
      await res.text();
      expect(at.calls[0]!.resume).toEqual({
        action: 'decline',
        taskId,
        expectedVersion: 4,
        idempotencyKey: 'key-1',
      });
      expect(at.calls[0]!.resume.patch).toBeUndefined();
      expect(await statusOf(pool, approvalId)).toBe('rejected');
    });
  });

  // The assignment card now travels the SAME contract as every other chat card.
  it('ASSIGNMENT — a primary confirm still assigns the top match', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const at = appWithRecorder();
      const approvalId = await seedFor(pool, at, makeCard(['u1'], randomUUID()));

      const res = await post(at.app, { approvalId, chosen: 'primary' });
      expect(res.status).toBe(200);
      await res.text();
      expect(at.calls[0]!.resume).toMatchObject({
        action: 'assign',
        assigneeUserIds: ['u1'],
      });
      expect(at.calls[0]!.ctx.workflowId).toBe('planner.assignment-orchestrator');
      expect(await statusOf(pool, approvalId)).toBe('approved');
    });
  });

  // Over HTTP, not through a component, because that is how an attacker reaches it.
  it('AC5 — a smuggled payload is refused, not stripped', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const at = appWithRecorder();
      const approvalId = await seedFor(pool, at, makeActionCard(randomUUID()), 'planner.action');

      const res = await post(at.app, {
        approvalId,
        chosen: 'primary',
        taskId: 'another-task',
        patch: { title: 'Smuggled' },
        overrideUserIds: ['attacker'],
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'validation_failed' });
      expect(at.calls).toHaveLength(0);
      expect(await statusOf(pool, approvalId)).toBe('pending');
    });
  });

  // Deliberately loud: a stale client steering a new mutation is a fault, not noise.
  it('a legacy body against an A2 card is 400', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const at = appWithRecorder();
      const approvalId = await seedFor(pool, at, makeActionCard(randomUUID()), 'planner.action');

      const res = await post(at.app, {
        approvalId,
        decision: 'approve',
        overrideUserIds: ['u1'],
      });
      expect(res.status).toBe(400);
      expect(await statusOf(pool, approvalId)).toBe('pending');
    });
  });

  it('chosen:"alternate" on an A2 card is out of range and refused', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const at = appWithRecorder();
      // The update card carries alternates: [].
      const approvalId = await seedFor(pool, at, makeActionCard(randomUUID()), 'planner.action');

      const res = await post(at.app, { approvalId, chosen: 'alternate', alternateIndex: 0 });
      expect(res.status).toBe(400);
      expect(await statusOf(pool, approvalId)).toBe('pending');
    });
  });

  it('an expired card returns 409 expired, not already_decided', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const at = appWithRecorder();
      const approvalId = await seedFor(pool, at, makeActionCard(randomUUID()), 'planner.action');
      // Expiry is a PERSISTED state the sweeper owns, not a computed one.
      await pool.query(
        "UPDATE agent.workflow_approvals SET expires_at = now() - interval '1 hour' WHERE approval_id = $1",
        [approvalId],
      );
      await sweepWorkflowApprovals({ pool, mastra: fakeMastra });

      const res = await post(at.app, { approvalId, chosen: 'primary' });
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ error: 'expired' });
      expect(at.calls).toHaveLength(0);
    });
  });

  // The reload case. The card is stateless across processes by design, so a
  // resume that shares NO in-memory state with the turn that created it must
  // still carry everything the tool needs.
  it('a confirm from a fresh app instance still forwards the full payload', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const seeder = appWithRecorder();
      const approvalId = await seedFor(
        pool,
        seeder,
        makeActionCard(randomUUID()),
        'planner.action',
      );
      // A second app object stands in for a second ECS process after a reload.
      const calls: CapturedResume[] = [];
      const fresh = buildApp(
        sessionWith(seeder.tenantId, seeder.userId, ['agent.workflow.approve']),
        makeFakeResume(calls),
      );

      const res = await post(fresh, { approvalId, chosen: 'primary' });
      expect(res.status).toBe(200);
      await res.text();
      expect(calls[0]!.resume).toMatchObject({
        expectedVersion: 4,
        idempotencyKey: 'key-1',
        patch: { due_at: '2026-08-15T16:59:00.000Z' },
      });
    });
  });
});

describe('POST /api/agent/v1/chat/resume — selecting an alternate', () => {
  // The AC "picking one of the suggested people assigns THAT person" made
  // executable. This is the test that fails if the frontend half of the
  // contract is ever dropped.
  it('resumes with the chosen alternate and records the branch on the row', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();
      const captured: CapturedResume[] = [];
      const app = buildApp(
        sessionWith(tenantId, userId, ['agent.workflow.approve']),
        makeFakeResume(captured),
      );
      const { approvalId } = await seedAgenticApproval(pool, {
        tenantId,
        approverUserId: userId,
        mastraRunId: 'mr-1',
        toolCallId: 'tc-1',
        threadId: 'th-1',
        card: makeCard(['top-1'], taskId),
      });

      const res = await post(app, { approvalId, chosen: 'alternate', alternateIndex: 0 });
      expect(res.status).toBe(200);
      await res.text();

      // Verbatim off the card — no mapping step, no client-supplied field.
      expect(captured[0]!.resume).toEqual({
        action: 'assign',
        assigneeUserIds: ['alt-1'],
        taskId,
        idempotencyKey: 'key-1',
      });
      expect(captured[0]!.ctx.workflowId).toBe('planner.assignment-orchestrator');

      const row = await pool.query<{ status: string; decision_payload: Record<string, unknown> }>(
        'SELECT status, decision_payload FROM agent.workflow_approvals WHERE approval_id = $1',
        [approvalId],
      );
      expect(row.rows[0]!.status).toBe('approved');
      // Without these two the transcript would name the top match forever.
      expect(row.rows[0]!.decision_payload).toMatchObject({
        chosen: 'alternate',
        alternate_index: 0,
      });
    });
  });

  it('refuses an out-of-range alternateIndex without consuming the approval', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const captured: CapturedResume[] = [];
      const app = buildApp(
        sessionWith(tenantId, userId, ['agent.workflow.approve']),
        makeFakeResume(captured),
      );
      const { approvalId } = await seedAgenticApproval(pool, {
        tenantId,
        approverUserId: userId,
        mastraRunId: 'mr-1',
        toolCallId: 'tc-1',
        threadId: 'th-1',
        card: makeCard(['top-1'], randomUUID()),
      });

      const res = await post(app, { approvalId, chosen: 'alternate', alternateIndex: 7 });
      expect(res.status).toBe(400);
      expect(await statusOf(pool, approvalId)).toBe('pending');
      expect(captured).toHaveLength(0);
    });
  });

  it('refuses a legacy body against an assignment card, and burns nothing', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const captured: CapturedResume[] = [];
      const app = buildApp(
        sessionWith(tenantId, userId, ['agent.workflow.approve']),
        makeFakeResume(captured),
      );
      const { approvalId } = await seedAgenticApproval(pool, {
        tenantId,
        approverUserId: userId,
        mastraRunId: 'mr-1',
        toolCallId: 'tc-1',
        threadId: 'th-1',
        card: makeCard(['top-1'], randomUUID()),
      });

      const res = await post(app, { approvalId, decision: 'modify', overrideUserIds: ['x'] });
      expect(res.status).toBe(400);
      expect(await statusOf(pool, approvalId)).toBe('pending');
      expect(captured).toHaveLength(0);
    });
  });
});

describe('POST /api/agent/v1/chat/resume — cards written before the deploy', () => {
  /** The shipped-before-FUT-806 shape: no decline payload, no key anywhere. */
  function legacyShapedCard(taskId: string) {
    return {
      ...makeCard(['top-1'], taskId),
      primary: {
        label: 'Assign',
        argsPatch: { action: 'assign', assigneeUserIds: ['top-1'], taskId },
      },
      alternates: [],
      decline: { label: 'Leave unassigned' },
    };
  }

  // §8.3: cards live 72 hours, so the common path has to keep working across
  // the deploy.
  it('still confirms on the primary branch', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const taskId = randomUUID();
      const captured: CapturedResume[] = [];
      const app = buildApp(
        sessionWith(tenantId, userId, ['agent.workflow.approve']),
        makeFakeResume(captured),
      );
      const { approvalId } = await seedAgenticApproval(pool, {
        tenantId,
        approverUserId: userId,
        mastraRunId: 'mr-1',
        toolCallId: 'tc-1',
        threadId: 'th-1',
        card: legacyShapedCard(taskId) as never,
      });

      const res = await post(app, { approvalId, chosen: 'primary' });
      expect(res.status).toBe(200);
      await res.text();
      expect(captured[0]!.resume).toEqual({
        action: 'assign',
        assigneeUserIds: ['top-1'],
        taskId,
      });
      expect(await statusOf(pool, approvalId)).toBe('approved');
    });
  });

  // The rare path fails CLOSED. selectArgsPatch returns {} for a decline branch
  // with no argsPatch, and the tool's strict resume schema refuses it. What is
  // NOT acceptable is an assign.
  it('never resumes with an assign when declining a card that has no decline payload', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const captured: CapturedResume[] = [];
      const app = buildApp(
        sessionWith(tenantId, userId, ['agent.workflow.approve']),
        makeFakeResume(captured),
      );
      const { approvalId } = await seedAgenticApproval(pool, {
        tenantId,
        approverUserId: userId,
        mastraRunId: 'mr-1',
        toolCallId: 'tc-1',
        threadId: 'th-1',
        card: legacyShapedCard(randomUUID()) as never,
      });

      const res = await post(app, { approvalId, chosen: 'decline' });
      expect(res.status).not.toBe(500);
      await res.text().catch(() => {});
      expect(captured[0]?.resume ?? {}).not.toMatchObject({ action: 'assign' });
      expect(await statusOf(pool, approvalId)).toBe('rejected');
    });
  });
});

describe('POST /api/agent/v1/chat/resume — a replaced card (FUT-840 design D13)', () => {
  it('confirming a SUPERSEDED card is a 409 with the new code, and the task is unchanged', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const me = sessionWith(tenantId, userId, ['agent.workflow.approve']);
      const { approvalId, runId } = await seedAgenticApproval(pool, {
        tenantId,
        approverUserId: userId,
        mastraRunId: randomUUID(),
        toolCallId: 'tc-1',
        threadId: randomUUID(),
        card: makeCard(['u1'], randomUUID()),
      });
      await pool.query(
        `UPDATE agent.workflow_approvals SET status = 'superseded' WHERE approval_id = $1`,
        [approvalId],
      );

      const captured: CapturedResume[] = [];
      const app = buildApp(me, makeFakeResume(captured));
      const res = await post(app, { approvalId, chosen: 'primary' });

      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe('superseded');
      // Nothing was resumed, so nothing was written.
      expect(captured).toHaveLength(0);
      expect(await outboxCount(pool, runId)).toBe(0);
    });
  });

  it('after an APPROVE on a chat card the run row is still paused and replayableDecision finds it', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const me = sessionWith(tenantId, userId, ['agent.workflow.approve']);
      const { approvalId, runId } = await seedAgenticApproval(pool, {
        tenantId,
        approverUserId: userId,
        mastraRunId: randomUUID(),
        toolCallId: 'tc-1',
        threadId: randomUUID(),
        card: makeCard(['u1'], randomUUID()),
      });

      const captured: CapturedResume[] = [];
      const app = buildApp(me, makeFakeResume(captured));
      const first = await post(app, { approvalId, chosen: 'primary' });
      expect(first.status).toBe(200);
      await first.text();

      const run = await pool.query<{ status: string }>(
        `SELECT status FROM agent.workflow_runs WHERE run_id = $1`,
        [runId],
      );
      expect(run.rows[0]!.status).toBe('paused');

      // The regression test for D13's narrowing (spec §0 finding 7). Repeat the
      // IDENTICAL decision: it must re-enter the suspended run (200, a stream)
      // rather than 409, because that recovery keys on r.status='paused'.
      const second = await post(app, { approvalId, chosen: 'primary' });
      expect(second.status).toBe(200);
      await second.text();
      expect(captured.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('POST /api/agent/v1/chat/resume — a revised preview (FUT-840)', () => {
  /** The SURVIVING card of a revision chain: `patch` carries BOTH the adjusted
   *  due date and the priority the user never re-said, and `meta.supersedes`
   *  names the card it replaced. */
  function makeRevisedCard(taskId: string, supersedes: string) {
    const base = makeActionCard(taskId);
    return {
      ...base,
      primary: {
        ...base.primary,
        argsPatch: {
          action: 'update',
          targets: [{ taskId, expectedVersion: 4 }],
          patch: { due_at: '2026-08-21T16:59:00.000Z', priority_number: 1 },
          idempotencyKey: 'key-revision-3',
        },
      },
      meta: { ...base.meta, supersedes, dedupKeys: [`task:${taskId}`] },
    };
  }

  it('confirming the NEW card applies the MERGED patch with no route change', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const at = appWithRecorder();
      const taskId = randomUUID();
      const approvalId = await seedFor(
        pool,
        at,
        makeRevisedCard(taskId, randomUUID()) as never,
        'planner.action',
      );

      // selectArgsPatch reads the persisted card verbatim, so nothing in this
      // route knows a revision happened. That is the whole reason AC4 needed no
      // work: the merged values ride along inside argsPatch.
      const res = await post(at.app, { approvalId, chosen: 'primary' });
      expect(res.status).toBe(200);
      await res.text();
      expect(at.calls[0]!.resume).toEqual({
        action: 'update',
        targets: [{ taskId, expectedVersion: 4 }],
        patch: { due_at: '2026-08-21T16:59:00.000Z', priority_number: 1 },
        idempotencyKey: 'key-revision-3',
      });
    });
  });

  it('confirming it twice yields ONE change, with the second refused as already decided', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const at = appWithRecorder();
      const taskId = randomUUID();
      const approvalId = await seedFor(
        pool,
        at,
        makeRevisedCard(taskId, randomUUID()) as never,
        'planner.action',
      );

      const first = await post(at.app, { approvalId, chosen: 'primary' });
      expect(first.status).toBe(200);
      await first.text();
      // Double-confirm is covered twice over: FOR UPDATE on the approval row
      // here, and the gateway's advisory lock on (tenant, idempotencyKey) if a
      // resume ever did reach it.
      const second = await post(at.app, { approvalId, chosen: 'decline' });
      expect(second.status).toBe(409);
      expect(at.calls).toHaveLength(1);
    });
  });

  it('never re-validates the persisted card, so a card-schema change cannot break Confirm', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const at = appWithRecorder();
      const taskId = randomUUID();
      const card = makeRevisedCard(taskId, randomUUID()) as Record<string, unknown> & {
        meta: Record<string, unknown>;
      };
      // A key no producer writes today — what a NEWER card would carry.
      card.meta = { ...card.meta, aFieldFromTheFuture: 'x' };

      const approvalId = await seedFor(pool, at, card as never, 'planner.action');
      // parseResumeBodyForWorkflow validates only the REQUEST BODY; selectArgsPatch
      // reads the card through a hand-rolled interface that touches
      // primary/alternates/decline only, and `meta` is a z.object that strips
      // unknown keys rather than rejecting them.
      const res = await post(at.app, { approvalId, chosen: 'primary' });
      expect(res.status).toBe(200);
      await res.text();
    });
  });
});
