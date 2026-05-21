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

async function onRunSuspended(client: PoolClient, evt: RunSuspendedEvent): Promise<void> {
  await client.query(
    `UPDATE copilot.workflow_runs
        SET status = 'paused', suspend_reason = $2
      WHERE run_id = $1`,
    [evt.runId, evt.suspendReason],
  );
  await client.query(
    `INSERT INTO copilot.workflow_approvals
       (approval_id, run_id, step_id, proposed_payload,
        approver_user_id, fallback_approver_user_id,
        surface_canvas, surface_chat_thread_id,
        status, expires_at, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)
     ON CONFLICT DO NOTHING`,
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
}
async function onRunFailed(client: PoolClient, evt: RunFailedEvent): Promise<void> {
  await terminate(client, evt, 'failed', `${evt.error.code}: ${evt.error.message}`);
}
async function onRunCanceled(client: PoolClient, evt: RunCanceledEvent): Promise<void> {
  await terminate(client, evt, 'canceled', null);
}
