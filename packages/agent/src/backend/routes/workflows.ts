import type { Mastra } from '@mastra/core';
import { RequestContext } from '@mastra/core/request-context';
import { AgentRegistry } from '@seta/agent-sdk';
import type { Hono } from 'hono';
import { cancelWorkflowRun } from '../domain/cancel-workflow-run.ts';
import { decideApproval } from '../domain/decide-approval.ts';
import { getWorkflowRun } from '../domain/get-workflow-run.ts';
import { getWorkflowRunSnapshot } from '../domain/get-workflow-run-snapshot.ts';
import { listMyPendingApprovals } from '../domain/list-my-pending-approvals.ts';
import { listThreadApprovals } from '../domain/list-thread-approvals.ts';
import { listWorkflowRuns } from '../domain/list-workflow-runs.ts';
import { replayWorkflowFromStep } from '../domain/replay-workflow-from-step.ts';
import { rerunWorkflow } from '../domain/rerun-workflow.ts';
import { issueSseToken } from '../workflows/_infra/auth-token.ts';
import { getWorkflowInputSchema } from '../workflows/_infra/input-schema-registry.ts';
import { onLifecycleEvent } from '../workflows/_infra/lifecycle-hook.ts';
import { mountInboxSse } from '../workflows/_infra/sse-inbox.ts';
import { mountRunSse } from '../workflows/_infra/sse-run.ts';
import { type AgentRouteDeps, type AgentRouteEnv, handleDomainError } from './_shared.ts';

export function mountWorkflowRoutes(app: Hono<AgentRouteEnv>, deps: AgentRouteDeps): void {
  mountInboxSse(app as unknown as Hono, { pool: deps.pool });
  mountRunSse(app as unknown as Hono, { pool: deps.pool, mastra: deps.mastra as Mastra });

  app.get('/api/agent/v1/workflows/runs', async (c) => {
    const session = c.get('session') as import('../types.ts').SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    const url = new URL(c.req.url);
    const scopeRaw = url.searchParams.get('scope') ?? 'self';
    if (
      scopeRaw !== 'self' &&
      scopeRaw !== 'group' &&
      scopeRaw !== 'tenant' &&
      scopeRaw !== 'instance'
    ) {
      return c.json(
        { error: 'invalid_scope', message: 'scope must be self|group|tenant|instance' },
        400,
      );
    }
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitStr = url.searchParams.get('limit');
    const limit = limitStr ? Number(limitStr) : undefined;
    if (limit !== undefined && !Number.isFinite(limit)) {
      return c.json({ error: 'invalid_limit', message: 'limit must be a number' }, 400);
    }
    const workflowId = url.searchParams.get('workflowId') ?? undefined;
    try {
      const result = await listWorkflowRuns({
        session,
        scope: scopeRaw,
        cursor,
        limit,
        filters: workflowId ? { workflowId } : undefined,
      });
      return c.json(result);
    } catch (err) {
      return handleDomainError(c, err);
    }
  });

  app.get('/api/agent/v1/workflows/runs/:runId', async (c) => {
    const session = c.get('session') as import('../types.ts').SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    try {
      const row = await getWorkflowRun({ session, runId: c.req.param('runId') });
      if (!row) return c.json({ error: 'not_found', message: 'workflow run not found' }, 404);
      return c.json(row);
    } catch (err) {
      return handleDomainError(c, err);
    }
  });

  app.get('/api/agent/v1/workflows/runs/:runId/snapshot', async (c) => {
    const session = c.get('session') as import('../types.ts').SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    try {
      const snap = await getWorkflowRunSnapshot({
        session,
        runId: c.req.param('runId'),
        mastra: deps.mastra as Mastra,
      });
      if (!snap) return c.json({ error: 'not_found', message: 'snapshot not found' }, 404);
      return c.json(snap);
    } catch (err) {
      return handleDomainError(c, err);
    }
  });

  app.get('/api/agent/v1/workflows/my-pending-approvals', async (c) => {
    const session = c.get('session') as import('../types.ts').SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    return c.json(await listMyPendingApprovals({ session }));
  });

  // All approvals (pending + decided) of one chat thread, addressed to the
  // caller. The chat UI renders decided rows persistently from this — see
  // listThreadApprovals for why deciding must not start a new agent turn.
  app.get('/api/agent/v1/workflows/threads/:threadId/approvals', async (c) => {
    const session = c.get('session') as import('../types.ts').SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    return c.json(await listThreadApprovals({ session, threadId: c.req.param('threadId') }));
  });

  app.post('/api/agent/v1/workflows/approvals/:approvalId/decide', async (c) => {
    const session = c.get('session') as import('../types.ts').SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    let body: {
      decision: 'approve' | 'reject' | 'modify';
      overrideUserIds?: string[];
      alternateIndex?: number;
      alternateIndices?: number[];
      note?: string;
    };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ error: 'invalid_body', message: 'JSON body required' }, 400);
    }
    if (body.decision !== 'approve' && body.decision !== 'reject' && body.decision !== 'modify') {
      return c.json(
        { error: 'invalid_decision', message: 'decision must be approve|reject|modify' },
        400,
      );
    }
    if (body.overrideUserIds !== undefined) {
      if (
        !Array.isArray(body.overrideUserIds) ||
        body.overrideUserIds.some((id) => typeof id !== 'string')
      ) {
        return c.json({ error: 'invalid_body', message: 'overrideUserIds must be string[]' }, 400);
      }
    }
    if (body.alternateIndex !== undefined) {
      if (typeof body.alternateIndex !== 'number' || body.alternateIndex < 0) {
        return c.json(
          { error: 'invalid_body', message: 'alternateIndex must be a non-negative number' },
          400,
        );
      }
    }
    if (body.alternateIndices !== undefined) {
      if (
        !Array.isArray(body.alternateIndices) ||
        body.alternateIndices.some((i) => typeof i !== 'number' || i < 0)
      ) {
        return c.json(
          { error: 'invalid_body', message: 'alternateIndices must be non-negative number[]' },
          400,
        );
      }
    }
    try {
      const result = await decideApproval({
        session,
        approvalId: c.req.param('approvalId'),
        decision: body.decision,
        overrideUserIds: body.overrideUserIds,
        alternateIndex: body.alternateIndex,
        alternateIndices: body.alternateIndices,
        note: body.note,
        mastra: deps.mastra as Mastra,
        chatHitlDeciders: deps.chatHitlDeciders,
        log: deps.log,
      });
      return c.json(result);
    } catch (err) {
      return handleDomainError(c, err);
    }
  });

  app.post('/api/agent/v1/workflows/runs/:runId/rerun', async (c) => {
    const session = c.get('session') as import('../types.ts').SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    const raw = (await c.req.json().catch(() => ({}))) as {
      inputOverride?: Record<string, unknown>;
    };
    const requestContext = new RequestContext();
    requestContext.set('actor', { type: 'user' as const, user_id: session.user_id });
    requestContext.set('tenant_id', session.tenant_id);
    requestContext.set('role_summary', session.role_summary);
    requestContext.set('effective_permissions', session.effective_permissions);
    try {
      const result = await rerunWorkflow({
        session,
        runId: c.req.param('runId'),
        inputOverride: raw.inputOverride,
        mastra: deps.mastra as Mastra,
        requestContext,
        pool: deps.pool,
      });
      // Drain pending lifecycle handler Promises before responding so the
      // run-started DB projection is committed before the client navigates.
      await deps.drainer.drain();
      return c.json(result);
    } catch (err) {
      return handleDomainError(c, err);
    }
  });

  app.post('/api/agent/v1/workflows/runs/:runId/replay-from-step', async (c) => {
    const session = c.get('session') as import('../types.ts').SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    const raw = (await c.req.json().catch(() => ({}))) as {
      stepId?: string;
      payload?: Record<string, unknown>;
    };
    if (!raw.stepId || typeof raw.stepId !== 'string') {
      return c.json({ error: 'bad_request', message: 'stepId is required' }, 400);
    }
    try {
      const result = await replayWorkflowFromStep({
        session,
        runId: c.req.param('runId'),
        stepId: raw.stepId,
        payload: raw.payload ?? {},
        mastra: deps.mastra as Mastra,
      });
      // Drain pending lifecycle handler Promises before responding.
      // EventEmitterPubSub fires async handlers via emitter.emit() which does
      // not await their Promises — the DB projection update (workflow.suspend
      // → SET status = 'paused', approval row insert) is still in-flight when
      // timeTravel() returns. Draining here ensures the client sees a
      // consistent snapshot on its first refetch after replay.
      await deps.drainer.drain();
      return c.json(result);
    } catch (err) {
      return handleDomainError(c, err);
    }
  });

  app.post('/api/agent/v1/workflows/runs/:runId/cancel', async (c) => {
    const session = c.get('session') as import('../types.ts').SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    try {
      await cancelWorkflowRun({
        session,
        runId: c.req.param('runId'),
        mastra: deps.mastra as Mastra,
      });
      return c.json({ ok: true });
    } catch (err) {
      return handleDomainError(c, err);
    }
  });

  app.post('/api/agent/v1/workflows/runs/:workflowId/start', async (c) => {
    const session = c.get('session') as import('../types.ts').SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    const workflowId = c.req.param('workflowId');
    const workflow = (deps.mastra as Mastra).getWorkflow(workflowId);
    if (!workflow) {
      return c.json({ error: 'not_found', message: `unknown workflow id: ${workflowId}` }, 404);
    }
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    console.log('[workflow.start] ← request', {
      workflowId,
      userId: session.user_id,
      inputKeys: Object.keys(body ?? {}),
    });
    if (body && typeof body === 'object' && Object.hasOwn(body, 'session')) {
      return c.json(
        {
          error: 'invalid_input',
          message:
            "request body must not contain a 'session' field — session derives from the authenticated request",
        },
        400,
      );
    }
    const requestContext = new RequestContext();
    requestContext.set('actor', { type: 'user' as const, user_id: session.user_id });
    requestContext.set('tenant_id', session.tenant_id);
    requestContext.set('role_summary', session.role_summary);
    requestContext.set('effective_permissions', session.effective_permissions);
    try {
      // Resolve Mastra's intrinsic workflow id (e.g. `planner.assignBySkill`)
      // up front — both the dedupe lookup (registry is keyed by mastra id) and
      // the lifecycle projection downstream use it.
      const projectedWorkflowId =
        typeof (workflow as { id?: unknown }).id === 'string'
          ? (workflow as { id: string }).id
          : workflowId;

      // Domain-scoped idempotency. A workflow can declare a dedupeKey in its
      // spec (e.g. planner.assignBySkill keys on taskId per spec §5.8). When
      // an in-flight run already exists for the same key, return that runId
      // instead of starting a duplicate.
      const spec = AgentRegistry.findWorkflowSpecByMastraId(projectedWorkflowId);
      if (spec?.dedupeKey) {
        const existingRunId = await spec.dedupeKey(body, {
          tenant_id: session.tenant_id,
          user_id: session.user_id,
          effective_permissions: session.effective_permissions,
          role_summary: session.role_summary,
        });
        if (existingRunId) {
          console.log('[workflow.start] → dedupe hit, reusing run', {
            runId: existingRunId,
            workflowId: projectedWorkflowId,
            userId: session.user_id,
          });
          return c.json({ runId: existingRunId });
        }
      }

      const run = await workflow.createRun();
      // Project the row synchronously so a GET on the returned runId never 404s,
      // even if the user opens the deep link before Mastra's async workflow.start
      // pubsub event reaches the lifecycle hook.
      await onLifecycleEvent(deps.pool, {
        kind: 'run-started',
        runId: run.runId,
        eventSeq: -1,
        workflowId: projectedWorkflowId,
        tenantId: session.tenant_id,
        startedBy: session.user_id,
        startedVia: 'event',
        parentThreadId: null,
        parentRunId: null,
        sourceEventId: null,
        inputSummary: body,
        occurredAt: new Date(),
      });
      const startedAt = Date.now();
      // Surface workflow-start failures: bare `void run.start(...)` would swallow
      // the rejection, leaving the projected row stuck in `running` forever.
      void run.start({ inputData: body, requestContext } as never).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        const rawCode = (err as { code?: unknown } | null)?.code;
        const code = typeof rawCode === 'string' ? rawCode : 'workflow_start_failed';
        if (deps.log) {
          deps.log.error(
            {
              subsystem: 'agent.workflow.start',
              runId: run.runId,
              workflowId: projectedWorkflowId,
              tenantId: session.tenant_id,
              err,
            },
            'workflow start failed',
          );
        } else {
          console.error('[agent.workflow.start]', {
            runId: run.runId,
            workflowId: projectedWorkflowId,
            err,
          });
        }
        void onLifecycleEvent(deps.pool, {
          kind: 'run-failed',
          runId: run.runId,
          eventSeq: -2,
          workflowId: projectedWorkflowId,
          tenantId: session.tenant_id,
          occurredAt: new Date(),
          durationMs: Date.now() - startedAt,
          error: { code, message },
        }).catch((projErr) => {
          if (deps.log) {
            deps.log.error(
              { subsystem: 'agent.workflow.start', runId: run.runId, err: projErr },
              'failed to project run-failed event',
            );
          } else {
            console.error('[agent.workflow.start.project-fail]', projErr);
          }
        });
      });
      console.log('[workflow.start] → run created', {
        runId: run.runId,
        workflowId: projectedWorkflowId,
        userId: session.user_id,
      });
      return c.json({ runId: run.runId });
    } catch (err) {
      return handleDomainError(c, err);
    }
  });

  app.get('/api/agent/v1/workflows/definitions', async (c) => {
    const session = c.get('session') as import('../types.ts').SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    const defs = AgentRegistry.snapshot().workflows.map((w) => {
      // Use Mastra's intrinsic workflow id (e.g. 'planner.assignBySkill') as the
      // definition id so it matches the workflow_id stored in workflow_runs.
      const mastraId =
        typeof (w.workflow as { id?: unknown }).id === 'string'
          ? (w.workflow as { id: string }).id
          : w.id;
      return {
        id: mastraId,
        domain: w.domain,
        description: w.description,
        hitlSteps: w.hitlSteps ?? [],
      };
    });
    return c.json({ rows: defs });
  });

  app.get('/api/agent/v1/workflows/:workflowId/input-schema', async (c) => {
    const session = c.get('session') as import('../types.ts').SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    const schema = getWorkflowInputSchema(c.req.param('workflowId'));
    if (!schema) {
      return c.json({ error: 'not_found', message: 'unknown workflow id' }, 404);
    }
    return c.json(schema);
  });

  app.get('/api/agent/v1/workflows/sse-token', async (c) => {
    const session = c.get('session') as import('../types.ts').SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    return c.json({
      token: issueSseToken({ userId: session.user_id, tenantId: session.tenant_id }),
    });
  });
}
