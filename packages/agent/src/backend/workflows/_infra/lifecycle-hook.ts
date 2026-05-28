import type { Pool, PoolClient } from 'pg';

interface BaseEvent {
  runId: string;
  eventSeq: number;
  workflowId: string;
  tenantId: string;
  occurredAt: Date;
}

export interface RunStartedEvent extends BaseEvent {
  kind: 'run-started';
  startedBy: string;
  startedVia: 'event' | 'chat' | 'rerun';
  parentThreadId: string | null;
  parentRunId: string | null;
  sourceEventId: string | null;
  inputSummary: unknown;
}

export interface RunSuspendedEvent extends BaseEvent {
  kind: 'run-suspended';
  stepId: string;
  suspendReason: string;
  proposedPayload: unknown;
  approverUserId: string;
  fallbackApproverUserId: string | null;
  surfaceCanvas: boolean;
  surfaceChatThreadId: string | null;
  expiresAt: Date;
}

export interface RunResumedEvent extends BaseEvent {
  kind: 'run-resumed';
}
export interface RunCompletedEvent extends BaseEvent {
  kind: 'run-completed';
  durationMs: number;
  outcome: 'success' | 'rejected';
  summary: unknown;
}
export interface RunFailedEvent extends BaseEvent {
  kind: 'run-failed';
  durationMs: number;
  error: { code: string; message: string };
}
export interface RunCanceledEvent extends BaseEvent {
  kind: 'run-canceled';
  durationMs: number;
}

export type MastraLifecycleEvent =
  | RunStartedEvent
  | RunSuspendedEvent
  | RunResumedEvent
  | RunCompletedEvent
  | RunFailedEvent
  | RunCanceledEvent;

export async function onLifecycleEvent(pool: Pool, evt: MastraLifecycleEvent): Promise<void> {
  console.log(`[workflow.lifecycle] ${evt.kind}`, {
    runId: evt.runId,
    workflowId: evt.workflowId,
    ...(evt.kind === 'run-started' ? { startedBy: evt.startedBy, startedVia: evt.startedVia } : {}),
    ...(evt.kind === 'run-suspended' ? { stepId: evt.stepId, reason: evt.suspendReason } : {}),
    ...(evt.kind === 'run-completed' ? { outcome: evt.outcome, durationMs: evt.durationMs } : {}),
    ...(evt.kind === 'run-failed' ? { error: evt.error.message, durationMs: evt.durationMs } : {}),
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const seen = await client.query(
      `INSERT INTO agent.workflow_run_events_seen (run_id, event_seq)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING run_id`,
      [evt.runId, evt.eventSeq],
    );
    if (seen.rowCount === 0) {
      await client.query('COMMIT');
      return;
    }
    await dispatch(client, evt);
    await client.query(`SELECT pg_notify('agent_workflow_runs', $1)`, [
      JSON.stringify({ runId: evt.runId, kind: evt.kind, tenantId: evt.tenantId }),
    ]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function dispatch(client: PoolClient, evt: MastraLifecycleEvent): Promise<void> {
  switch (evt.kind) {
    case 'run-started':
      return onRunStarted(client, evt);
    case 'run-suspended':
      return onRunSuspended(client, evt);
    case 'run-resumed':
      return onRunResumed(client, evt);
    case 'run-completed':
      return onRunCompleted(client, evt);
    case 'run-failed':
      return onRunFailed(client, evt);
    case 'run-canceled':
      return onRunCanceled(client, evt);
  }
}

async function onRunStarted(client: PoolClient, evt: RunStartedEvent): Promise<void> {
  await client.query(
    `INSERT INTO agent.workflow_runs
       (run_id, workflow_id, tenant_id, started_by, started_via,
        parent_thread_id, parent_run_id, source_event_id,
        input_summary, status, started_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'running', $10)
     ON CONFLICT (run_id) DO NOTHING`,
    [
      evt.runId,
      evt.workflowId,
      evt.tenantId,
      evt.startedBy,
      evt.startedVia,
      evt.parentThreadId,
      evt.parentRunId,
      evt.sourceEventId,
      JSON.stringify(evt.inputSummary),
      evt.occurredAt,
    ],
  );
}

async function insertOutboxEvent(
  client: PoolClient,
  args: {
    eventType: string;
    aggregateId: string;
    tenantId: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO core.events
       (id, tenant_id, aggregate_type, aggregate_id, event_type, event_version, payload)
     VALUES (gen_random_uuid(), $1, 'workflow_run', $2, $3, 1, $4)`,
    [args.tenantId, args.aggregateId, args.eventType, args.payload],
  );
}

async function onRunSuspended(client: PoolClient, evt: RunSuspendedEvent): Promise<void> {
  console.warn('[agent.lifecycle-hook] onRunSuspended', {
    runId: evt.runId,
    stepId: evt.stepId,
    suspendReason: evt.suspendReason,
    surfaceChatThreadId: evt.surfaceChatThreadId,
    surfaceCanvas: evt.surfaceCanvas,
    approverUserId: evt.approverUserId,
    tenantId: evt.tenantId,
  });

  await client.query(
    `UPDATE agent.workflow_runs
        SET status = 'paused', suspend_reason = $2
      WHERE run_id = $1`,
    [evt.runId, evt.suspendReason],
  );
  // Supersede any existing pending approval for this run (e.g. from a prior
  // HITL cycle that was never decided, or a previous execution that completed
  // without the approval being resolved). This keeps at most one pending
  // approval per run at any given time.
  await client.query(
    `UPDATE agent.workflow_approvals
        SET status = 'superseded', decided_at = NOW()
      WHERE run_id = $1 AND status = 'pending'`,
    [evt.runId],
  );
  // If the adapter couldn't read tenant/approver from requestContext (e.g. a
  // Mastra version that doesn't echo it on suspend), recover from the seeded
  // row — workflow_runs is populated synchronously by the /start handler.
  let { tenantId, approverUserId } = evt;
  if (!tenantId || !approverUserId) {
    const r = await client.query<{ tenant_id: string; started_by: string }>(
      `SELECT tenant_id, started_by FROM agent.workflow_runs WHERE run_id = $1`,
      [evt.runId],
    );
    const row = r.rows[0];
    if (!row) return;
    if (!tenantId) tenantId = row.tenant_id;
    if (!approverUserId) approverUserId = row.started_by;
  }
  const ins = await client.query<{ approval_id: string }>(
    `INSERT INTO agent.workflow_approvals
       (approval_id, run_id, step_id, proposed_payload,
        approver_user_id, fallback_approver_user_id,
        surface_canvas, surface_chat_thread_id,
        status, expires_at, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)
     ON CONFLICT (run_id, step_id) DO UPDATE
       SET status               = 'pending',
           proposed_payload     = EXCLUDED.proposed_payload,
           approver_user_id     = EXCLUDED.approver_user_id,
           fallback_approver_user_id = EXCLUDED.fallback_approver_user_id,
           surface_canvas       = EXCLUDED.surface_canvas,
           surface_chat_thread_id = EXCLUDED.surface_chat_thread_id,
           expires_at           = EXCLUDED.expires_at,
           created_at           = EXCLUDED.created_at,
           decided_at           = NULL,
           decided_by           = NULL,
           decision_payload     = NULL
     RETURNING approval_id`,
    [
      evt.runId,
      evt.stepId,
      JSON.stringify(evt.proposedPayload),
      approverUserId,
      evt.fallbackApproverUserId,
      evt.surfaceCanvas,
      evt.surfaceChatThreadId,
      evt.expiresAt,
      evt.occurredAt,
    ],
  );
  if (ins.rowCount === 0) return;

  const approvalId = ins.rows[0]?.approval_id;
  await insertOutboxEvent(client, {
    eventType: 'agent.workflow.approval.requested',
    aggregateId: evt.runId,
    tenantId,
    payload: {
      approval_id: approvalId,
      workflow_id: evt.workflowId,
      tenant_id: tenantId,
      approver_user_id: approverUserId,
      proposed_payload: evt.proposedPayload,
      expires_at: evt.expiresAt.toISOString(),
      surface: [
        ...(evt.surfaceCanvas ? ['canvas' as const] : []),
        ...(evt.surfaceChatThreadId ? ['chat' as const] : []),
      ],
    },
  });
}
async function onRunResumed(client: PoolClient, evt: RunResumedEvent): Promise<void> {
  await client.query(
    `UPDATE agent.workflow_runs
        SET status = 'running', suspend_reason = NULL
      WHERE run_id = $1`,
    [evt.runId],
  );
}

async function terminate(
  client: PoolClient,
  evt: BaseEvent & { durationMs: number },
  status: 'success' | 'failed' | 'canceled',
  errorSummary: string | null,
): Promise<void> {
  await client.query(
    `UPDATE agent.workflow_runs
        SET status = $2, finished_at = $3, duration_ms = $4, error_summary = $5
      WHERE run_id = $1`,
    [evt.runId, status, evt.occurredAt, evt.durationMs, errorSummary],
  );
  // Cancel any pending approvals so they don't resurface if the run is replayed.
  await client.query(
    `UPDATE agent.workflow_approvals
        SET status = 'superseded', decided_at = NOW()
      WHERE run_id = $1 AND status = 'pending'`,
    [evt.runId],
  );
}

async function onRunCompleted(client: PoolClient, evt: RunCompletedEvent): Promise<void> {
  await terminate(client, evt, 'success', null);
  // Fetch identity columns from the run row — terminal events on 'workflows-finish' may arrive
  // without requestContext (evented runtime doesn't echo it back on finish).
  const r = await client.query<{ started_by: string; tenant_id: string }>(
    `SELECT started_by, tenant_id FROM agent.workflow_runs WHERE run_id = $1`,
    [evt.runId],
  );
  if (!r.rows[0]) return;
  const { started_by: startedBy, tenant_id: tenantId } = r.rows[0];
  await insertOutboxEvent(client, {
    eventType: 'agent.workflow.run.completed',
    aggregateId: evt.runId,
    tenantId,
    payload: {
      workflow_id: evt.workflowId,
      tenant_id: tenantId,
      started_by: startedBy,
      duration_ms: evt.durationMs,
      outcome: evt.outcome,
      summary: evt.summary,
    },
  });
}
async function onRunFailed(client: PoolClient, evt: RunFailedEvent): Promise<void> {
  await terminate(client, evt, 'failed', `${evt.error.code}: ${evt.error.message}`);
  // Fetch identity columns from the run row — terminal events on 'workflows-finish' may arrive
  // without requestContext (evented runtime doesn't echo it back on finish).
  const r = await client.query<{ started_by: string; tenant_id: string }>(
    `SELECT started_by, tenant_id FROM agent.workflow_runs WHERE run_id = $1`,
    [evt.runId],
  );
  if (!r.rows[0]) return;
  const { started_by: startedBy, tenant_id: tenantId } = r.rows[0];
  await insertOutboxEvent(client, {
    eventType: 'agent.workflow.run.failed',
    aggregateId: evt.runId,
    tenantId,
    payload: {
      workflow_id: evt.workflowId,
      tenant_id: tenantId,
      started_by: startedBy,
      duration_ms: evt.durationMs,
      error: { code: evt.error.code, message: evt.error.message },
    },
  });
}
async function onRunCanceled(client: PoolClient, evt: RunCanceledEvent): Promise<void> {
  await terminate(client, evt, 'canceled', null);
}

export interface RawMastraEvent {
  type: string;
  runId: string;
  data?: Record<string, unknown>;
}

/**
 * Read a key from a Mastra request-context value that may arrive in either of
 * two shapes depending on the emitting event:
 *  - serialized plain object (workflow.start uses `requestContext.toJSON()`)
 *  - live `RequestContext` class instance (workflow.suspend / .end / etc. spread
 *    the live object — see mastra workflow-event-processor/index.ts:1607)
 *
 * Returns undefined when the key isn't present. Reading is intentionally
 * forgiving: a missing/typeless value just bubbles up as undefined so the
 * branch-level null guard can decide whether to drop the event.
 */
function readRc(rc: unknown, key: string): unknown {
  if (!rc || typeof rc !== 'object') return undefined;
  const maybeGet = (rc as { get?: unknown }).get;
  if (typeof maybeGet === 'function') {
    try {
      return (maybeGet as (k: string) => unknown).call(rc, key);
    } catch {
      // fall through to direct property access
    }
  }
  return (rc as Record<string, unknown>)[key];
}

export function adaptMastraEvent(raw: RawMastraEvent): MastraLifecycleEvent | null {
  // workflow_run_events_seen has run_id NOT NULL, and every dispatch target
  // keys on runId. Mastra occasionally publishes lifecycle-shaped events
  // without a run-level runId (e.g. nested-workflow framing). Drop those —
  // they don't correspond to a row we'd ever project.
  if (typeof raw.runId !== 'string' || raw.runId.length === 0) return null;
  const data = raw.data ?? {};
  const occurredAt = new Date();
  const workflowId = typeof data.workflowId === 'string' ? data.workflowId : '';
  const rc = data.requestContext;
  // Keys match the codebase convention seeded by every caller of RequestContext.set:
  // `tenant_id` (snake) and `actor` ({ user_id }). See sdks/agent/src/session-context.ts.
  const tenantIdRaw = readRc(rc, 'tenant_id');
  const tenantId = typeof tenantIdRaw === 'string' ? tenantIdRaw : '';
  const actorRaw = readRc(rc, 'actor');
  const actor = (actorRaw ?? {}) as { user_id?: unknown };
  const startedBy = typeof actor.user_id === 'string' ? actor.user_id : '';
  const startedViaRaw = readRc(rc, 'started_via');
  const startedVia =
    startedViaRaw === 'chat' || startedViaRaw === 'rerun' ? startedViaRaw : 'event';

  switch (raw.type) {
    case 'workflow.start': {
      if (!tenantId || !startedBy || !workflowId) return null;
      const prevResult = data.prevResult as { output?: unknown } | undefined;
      return {
        kind: 'run-started',
        runId: raw.runId,
        eventSeq: hashEventSeq(raw.type, raw.runId, ''),
        workflowId,
        tenantId,
        startedBy,
        startedVia,
        parentThreadId: ((): string | null => {
          const v = readRc(rc, 'parent_thread_id');
          return typeof v === 'string' ? v : null;
        })(),
        parentRunId: ((): string | null => {
          const v = readRc(rc, 'parent_run_id');
          return typeof v === 'string' ? v : null;
        })(),
        sourceEventId: ((): string | null => {
          const v = readRc(rc, 'source_event_id');
          return typeof v === 'string' ? v : null;
        })(),
        inputSummary: prevResult?.output ?? {},
        occurredAt,
      };
    }
    case 'workflow.resume':
      return {
        kind: 'run-resumed',
        runId: raw.runId,
        eventSeq: hashEventSeq(raw.type, raw.runId, '', occurredAt),
        workflowId,
        tenantId,
        occurredAt,
      };
    case 'workflow.cancel': {
      const durationMs = typeof data.durationMs === 'number' ? data.durationMs : 0;
      return {
        kind: 'run-canceled',
        runId: raw.runId,
        eventSeq: hashEventSeq(raw.type, raw.runId, '', occurredAt),
        workflowId,
        tenantId,
        occurredAt,
        durationMs,
      };
    }
    case 'workflow.end': {
      const durationMs = typeof data.durationMs === 'number' ? data.durationMs : 0;
      const state = data.state as { result?: { output?: unknown } } | undefined;
      return {
        kind: 'run-completed',
        runId: raw.runId,
        eventSeq: hashEventSeq(raw.type, raw.runId, '', occurredAt),
        workflowId,
        tenantId,
        occurredAt,
        durationMs,
        outcome: 'success',
        summary: state?.result?.output ?? {},
      };
    }
    case 'workflow.fail': {
      const durationMs = typeof data.durationMs === 'number' ? data.durationMs : 0;
      const errSource = (data.error ?? data.errorInfo ?? {}) as { code?: string; message?: string };
      return {
        kind: 'run-failed',
        runId: raw.runId,
        eventSeq: hashEventSeq(raw.type, raw.runId, '', occurredAt),
        workflowId,
        tenantId,
        occurredAt,
        durationMs,
        error: {
          code: typeof errSource.code === 'string' ? errSource.code : 'unknown',
          message: typeof errSource.message === 'string' ? errSource.message : 'workflow failed',
        },
      };
    }
    case 'workflow.suspend': {
      // Mastra's evented engine doesn't echo a single `stepId` field on the
      // suspend event — it provides `resumeSteps: string[]` (the step ids that
      // can be resumed for this suspension). Use the first; fall back to
      // `data.stepId` for older Mastras and 'await-approval' as a last resort.
      const resumeSteps = Array.isArray(data.resumeSteps) ? (data.resumeSteps as unknown[]) : null;
      const firstResumeStep = resumeSteps?.find((s): s is string => typeof s === 'string') ?? null;
      const stepId =
        firstResumeStep ?? (typeof data.stepId === 'string' ? data.stepId : 'await-approval');

      console.warn('[agent.lifecycle-hook] adaptMastraEvent workflow.suspend', {
        runId: raw.runId,
        stepId,
        workflowId,
        tenantId,
        startedBy,
        resumeSteps,
        hasPrevResult: data.prevResult !== undefined,
        hasProposedPayload: data.proposedPayload !== undefined,
        rcThreadId: (() => {
          const v = readRc(rc, 'thread_id');
          return typeof v === 'string' ? v : null;
        })(),
      });
      // The actual suspend payload (the ApprovalCard the workflow passed to
      // `suspend(card)`) lands on `data.prevResult.suspendPayload` in the
      // event Mastra publishes — *not* on `data.proposedPayload` (Mastra never
      // sets that). Fall back to `data.stepResults[stepId].suspendPayload`
      // for older Mastras / snapshot-style shapes.
      const prevResult = (data.prevResult ?? {}) as { suspendPayload?: unknown };
      const stepResults = (data.stepResults ?? {}) as Record<string, unknown>;
      const stepEntry = firstResumeStep ? (stepResults[firstResumeStep] as unknown) : undefined;
      const proposedFromSuspend =
        prevResult.suspendPayload ??
        (stepEntry && typeof stepEntry === 'object'
          ? ((stepEntry as { suspendPayload?: unknown; payload?: unknown }).suspendPayload ??
            (stepEntry as { payload?: unknown }).payload)
          : undefined);
      const suspendReason =
        typeof data.suspendReason === 'string' ? data.suspendReason : 'hitl_pending';
      const proposedPayload = data.proposedPayload ?? proposedFromSuspend ?? {};
      // Approver defaults to the rc actor; if both rc parsing and the explicit
      // field fail we leave it empty and let onRunSuspended fill it in from
      // workflow_runs.started_by (it always has the seeded value). Same idea
      // for tenantId — populated at dispatch time when missing.
      const approverUserId =
        typeof data.approverUserId === 'string' ? data.approverUserId : startedBy;
      const fallbackApproverUserId =
        typeof data.fallbackApproverUserId === 'string' ? data.fallbackApproverUserId : null;
      const surfaceCanvas = data.surfaceCanvas !== false;
      const surfaceChatThreadId =
        typeof data.surfaceChatThreadId === 'string'
          ? data.surfaceChatThreadId
          : ((): string | null => {
              // Fall back to the thread_id the chat route seeded onto the
              // requestContext — this is the agent-tool HITL path where Mastra
              // never populates data.surfaceChatThreadId directly.
              const v = readRc(rc, 'thread_id');
              return typeof v === 'string' && v.length > 0 ? v : null;
            })();
      const expiresAt =
        typeof data.expiresAt === 'string'
          ? new Date(data.expiresAt)
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      return {
        kind: 'run-suspended',
        runId: raw.runId,
        eventSeq: hashEventSeq(raw.type, raw.runId, stepId, occurredAt),
        workflowId,
        tenantId,
        occurredAt,
        stepId,
        suspendReason,
        proposedPayload,
        approverUserId,
        fallbackApproverUserId,
        surfaceCanvas,
        surfaceChatThreadId,
        expiresAt,
      };
    }
    default:
      return null;
  }
}

/**
 * Produces a stable integer key for the workflow_run_events_seen dedup table.
 *
 * Rules:
 * - `workflow.start` uses only (type, runId) — the /start route inserts eventSeq
 *   -1 directly; the EventEmitter path lands here and gets the same deterministic
 *   hash regardless of wall clock, so both paths collide on dedup as intended.
 * - All other event types incorporate the processing timestamp (ms). This ensures
 *   that the same logical event (e.g. workflow.suspend) can be re-processed on a
 *   replay or an additional HITL cycle without being silently dropped.
 */
function hashEventSeq(type: string, runId: string, suffix: string, occurredAt?: Date): number {
  const ts = type === 'workflow.start' ? '' : `::${(occurredAt ?? new Date()).getTime()}`;
  const s = `${type}::${runId}::${suffix}${ts}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return Math.abs(h | 0);
}
