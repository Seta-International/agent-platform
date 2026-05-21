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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const seen = await client.query(
      `INSERT INTO copilot.workflow_run_events_seen (run_id, event_seq)
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
    await client.query(`SELECT pg_notify('copilot_workflow_runs', $1)`, [
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
    `INSERT INTO copilot.workflow_runs
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
  await client.query(
    `UPDATE copilot.workflow_runs
        SET status = 'paused', suspend_reason = $2
      WHERE run_id = $1`,
    [evt.runId, evt.suspendReason],
  );
  const ins = await client.query<{ approval_id: string }>(
    `INSERT INTO copilot.workflow_approvals
       (approval_id, run_id, step_id, proposed_payload,
        approver_user_id, fallback_approver_user_id,
        surface_canvas, surface_chat_thread_id,
        status, expires_at, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)
     ON CONFLICT DO NOTHING
     RETURNING approval_id`,
    [
      evt.runId,
      evt.stepId,
      JSON.stringify(evt.proposedPayload),
      evt.approverUserId,
      evt.fallbackApproverUserId,
      evt.surfaceCanvas,
      evt.surfaceChatThreadId,
      evt.expiresAt,
      evt.occurredAt,
    ],
  );
  if (ins.rowCount === 0) return;

  const approvalId = ins.rows[0]!.approval_id;
  await insertOutboxEvent(client, {
    eventType: 'copilot.workflow.approval.requested',
    aggregateId: evt.runId,
    tenantId: evt.tenantId,
    payload: {
      approval_id: approvalId,
      workflow_id: evt.workflowId,
      tenant_id: evt.tenantId,
      approver_user_id: evt.approverUserId,
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
    `UPDATE copilot.workflow_runs
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
    `UPDATE copilot.workflow_runs
        SET status = $2, finished_at = $3, duration_ms = $4, error_summary = $5
      WHERE run_id = $1`,
    [evt.runId, status, evt.occurredAt, evt.durationMs, errorSummary],
  );
}

async function onRunCompleted(client: PoolClient, evt: RunCompletedEvent): Promise<void> {
  await terminate(client, evt, 'success', null);
  // Fetch identity columns from the run row — terminal events on 'workflows-finish' may arrive
  // without requestContext (evented runtime doesn't echo it back on finish).
  const r = await client.query<{ started_by: string; tenant_id: string }>(
    `SELECT started_by, tenant_id FROM copilot.workflow_runs WHERE run_id = $1`,
    [evt.runId],
  );
  if (!r.rows[0]) return;
  const { started_by: startedBy, tenant_id: tenantId } = r.rows[0];
  await insertOutboxEvent(client, {
    eventType: 'copilot.workflow.run.completed',
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
    `SELECT started_by, tenant_id FROM copilot.workflow_runs WHERE run_id = $1`,
    [evt.runId],
  );
  if (!r.rows[0]) return;
  const { started_by: startedBy, tenant_id: tenantId } = r.rows[0];
  await insertOutboxEvent(client, {
    eventType: 'copilot.workflow.run.failed',
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

export function adaptMastraEvent(raw: RawMastraEvent): MastraLifecycleEvent | null {
  const data = raw.data ?? {};
  const occurredAt = new Date();
  const workflowId = typeof data.workflowId === 'string' ? data.workflowId : '';
  const rc = (data.requestContext ?? {}) as Record<string, unknown>;
  const tenantId = typeof rc.tenantId === 'string' ? rc.tenantId : '';
  const startedBy = typeof rc.startedBy === 'string' ? rc.startedBy : '';
  const startedVia =
    rc.startedVia === 'chat' || rc.startedVia === 'rerun' ? rc.startedVia : 'event';

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
        parentThreadId: typeof rc.parentThreadId === 'string' ? rc.parentThreadId : null,
        parentRunId: typeof rc.parentRunId === 'string' ? rc.parentRunId : null,
        sourceEventId: typeof rc.sourceEventId === 'string' ? rc.sourceEventId : null,
        inputSummary: prevResult?.output ?? {},
        occurredAt,
      };
    }
    case 'workflow.resume':
      return {
        kind: 'run-resumed',
        runId: raw.runId,
        eventSeq: hashEventSeq(raw.type, raw.runId, ''),
        workflowId,
        tenantId,
        occurredAt,
      };
    case 'workflow.cancel': {
      const durationMs = typeof data.durationMs === 'number' ? data.durationMs : 0;
      return {
        kind: 'run-canceled',
        runId: raw.runId,
        eventSeq: hashEventSeq(raw.type, raw.runId, ''),
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
        eventSeq: hashEventSeq(raw.type, raw.runId, ''),
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
        eventSeq: hashEventSeq(raw.type, raw.runId, ''),
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
      const stepId = typeof data.stepId === 'string' ? data.stepId : 'await-approval';
      const suspendReason =
        typeof data.suspendReason === 'string' ? data.suspendReason : 'hitl_pending';
      const proposedPayload = data.proposedPayload ?? {};
      const approverUserId =
        typeof data.approverUserId === 'string' ? data.approverUserId : startedBy;
      const fallbackApproverUserId =
        typeof data.fallbackApproverUserId === 'string' ? data.fallbackApproverUserId : null;
      const surfaceCanvas = data.surfaceCanvas === false ? false : true;
      const surfaceChatThreadId =
        typeof data.surfaceChatThreadId === 'string' ? data.surfaceChatThreadId : null;
      const expiresAt =
        typeof data.expiresAt === 'string'
          ? new Date(data.expiresAt)
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      if (!approverUserId) return null;
      return {
        kind: 'run-suspended',
        runId: raw.runId,
        eventSeq: hashEventSeq(raw.type, raw.runId, stepId),
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

function hashEventSeq(type: string, runId: string, suffix: string): number {
  const s = `${type}::${runId}::${suffix}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return Math.abs(h | 0);
}
