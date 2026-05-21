import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MastraLifecycleEvent } from '../src/backend/workflows/lifecycle-hook.ts';
import { onLifecycleEvent } from '../src/backend/workflows/lifecycle-hook.ts';
import { withCopilotTestDb } from './test-helpers.ts';

const FIXED_RUN_ID = '11111111-1111-1111-1111-111111111111';
const FIXED_TENANT_ID = '22222222-2222-2222-2222-222222222222';
const FIXED_USER_ID = '33333333-3333-3333-3333-333333333333';
const FIXED_SOURCE_EVENT_ID = '44444444-4444-4444-4444-444444444444';

const baseRunStarted = (overrides: Partial<MastraLifecycleEvent> = {}): MastraLifecycleEvent =>
  ({
    kind: 'run-started',
    runId: FIXED_RUN_ID,
    eventSeq: 1,
    workflowId: 'copilot.test-workflow',
    tenantId: FIXED_TENANT_ID,
    startedBy: FIXED_USER_ID,
    startedVia: 'event',
    parentThreadId: null,
    parentRunId: null,
    sourceEventId: FIXED_SOURCE_EVENT_ID,
    inputSummary: { taskTitle: 'demo' },
    occurredAt: new Date('2026-05-21T00:00:00Z'),
    ...overrides,
  }) as MastraLifecycleEvent;

describe('onLifecycleEvent — idempotency', () => {
  it('inserts a workflow_runs row on first delivery of run-started', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      await onLifecycleEvent(pool, baseRunStarted());
      const rows = await pool.query(
        `SELECT run_id, status, source_event_id FROM copilot.workflow_runs WHERE run_id = $1`,
        [FIXED_RUN_ID],
      );
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0]!.status).toBe('running');
    });
  });

  it('no-ops on a second delivery of the same (run_id, event_seq)', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      await onLifecycleEvent(pool, baseRunStarted());
      await onLifecycleEvent(pool, baseRunStarted());
      const cnt = await pool.query(
        `SELECT count(*)::int AS n FROM copilot.workflow_run_events_seen WHERE run_id = $1`,
        [FIXED_RUN_ID],
      );
      expect(cnt.rows[0]!.n).toBe(1);
    });
  });

  it('different event_seq for same run produces two seen rows', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const runId = randomUUID();
      await onLifecycleEvent(pool, baseRunStarted({ runId, eventSeq: 1 }));
      // second run-started with eventSeq:2 hits ON CONFLICT DO NOTHING on workflow_runs PK,
      // but still records a seen row for seq 2
      await onLifecycleEvent(pool, baseRunStarted({ runId, eventSeq: 2 }));
      const cnt = await pool.query(
        `SELECT count(*)::int AS n FROM copilot.workflow_run_events_seen WHERE run_id = $1`,
        [runId],
      );
      expect(cnt.rows[0]!.n).toBe(2);
    });
  });
});

describe('onLifecycleEvent — run-suspended', () => {
  it('updates run status to paused and writes a workflow_approvals row', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const runId = randomUUID();
      const tenantId = randomUUID();
      const approverUserId = randomUUID();
      await onLifecycleEvent(
        pool,
        baseRunStarted({ runId, eventSeq: 1, tenantId, startedBy: approverUserId }),
      );

      await onLifecycleEvent(pool, {
        kind: 'run-suspended',
        runId,
        eventSeq: 2,
        workflowId: 'copilot.test-workflow',
        tenantId,
        occurredAt: new Date('2026-05-21T00:01:00Z'),
        stepId: 'await-approval',
        suspendReason: 'hitl_pending',
        proposedPayload: { userId: '77777777-7777-7777-7777-777777777777' },
        approverUserId,
        fallbackApproverUserId: null,
        surfaceCanvas: true,
        surfaceChatThreadId: null,
        expiresAt: new Date('2026-05-28T00:01:00Z'),
      });

      const r = await pool.query(
        `SELECT status, suspend_reason FROM copilot.workflow_runs WHERE run_id = $1`,
        [runId],
      );
      expect(r.rows[0]!.status).toBe('paused');
      expect(r.rows[0]!.suspend_reason).toBe('hitl_pending');

      const a = await pool.query(
        `SELECT status, approver_user_id, surface_canvas, expires_at
           FROM copilot.workflow_approvals WHERE run_id = $1`,
        [runId],
      );
      expect(a.rowCount).toBe(1);
      expect(a.rows[0]!.status).toBe('pending');
      expect(a.rows[0]!.approver_user_id).toBe(approverUserId);
      expect(a.rows[0]!.surface_canvas).toBe(true);
    });
  });

  it('is idempotent — second delivery of same (runId, eventSeq) no-ops the approval insert', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const runId = randomUUID();
      const tenantId = randomUUID();
      const approverUserId = randomUUID();
      await onLifecycleEvent(
        pool,
        baseRunStarted({ runId, eventSeq: 1, tenantId, startedBy: approverUserId }),
      );

      const suspendEvt = {
        kind: 'run-suspended' as const,
        runId,
        eventSeq: 2,
        workflowId: 'copilot.test-workflow',
        tenantId,
        occurredAt: new Date(),
        stepId: 'await-approval',
        suspendReason: 'hitl_pending',
        proposedPayload: {},
        approverUserId,
        fallbackApproverUserId: null,
        surfaceCanvas: true,
        surfaceChatThreadId: null,
        expiresAt: new Date(Date.now() + 86400000),
      };
      await onLifecycleEvent(pool, suspendEvt);
      await onLifecycleEvent(pool, suspendEvt);

      const a = await pool.query(
        `SELECT count(*)::int AS n FROM copilot.workflow_approvals WHERE run_id = $1`,
        [runId],
      );
      expect(a.rows[0]!.n).toBe(1);
    });
  });
});

describe('onLifecycleEvent — outbox emission', () => {
  it('writes a core.events row for each outbox-eligible kind', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const runId = randomUUID();
      const tenantId = randomUUID();
      const userId = randomUUID();
      const approverUserId = randomUUID();

      await onLifecycleEvent(
        pool,
        baseRunStarted({ runId, eventSeq: 1, tenantId, startedBy: userId }),
      );
      await onLifecycleEvent(pool, {
        kind: 'run-suspended',
        runId,
        eventSeq: 2,
        workflowId: 'copilot.test-workflow',
        tenantId,
        occurredAt: new Date(),
        stepId: 'await-approval',
        suspendReason: 'hitl_pending',
        proposedPayload: {},
        approverUserId,
        fallbackApproverUserId: null,
        surfaceCanvas: true,
        surfaceChatThreadId: null,
        expiresAt: new Date(Date.now() + 86400000),
      });
      await onLifecycleEvent(pool, {
        kind: 'run-completed',
        runId,
        eventSeq: 3,
        workflowId: 'copilot.test-workflow',
        tenantId,
        occurredAt: new Date(),
        durationMs: 100,
        outcome: 'success',
        summary: {},
      });

      const evts = await pool.query<{
        event_type: string;
        aggregate_id: string;
        tenant_id: string;
        payload: Record<string, unknown>;
      }>(
        `SELECT event_type, aggregate_id, tenant_id, payload FROM core.events
          WHERE aggregate_id = $1
          ORDER BY occurred_at ASC, event_type ASC`,
        [runId],
      );
      expect(evts.rows.map((r) => r.event_type)).toEqual([
        'copilot.workflow.approval.requested',
        'copilot.workflow.run.completed',
      ]);
      expect(evts.rows[0]!.tenant_id).toBe(tenantId);
      expect(evts.rows[1]!.tenant_id).toBe(tenantId);
      expect(evts.rows[0]!.payload.approval_id).toBeTruthy();
      expect(evts.rows[1]!.payload.outcome).toBe('success');
    });
  });

  it('writes copilot.workflow.run.failed for a run-failed terminal event', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const runId = randomUUID();
      const tenantId = randomUUID();
      const userId = randomUUID();
      await onLifecycleEvent(
        pool,
        baseRunStarted({ runId, eventSeq: 1, tenantId, startedBy: userId }),
      );
      await onLifecycleEvent(pool, {
        kind: 'run-failed',
        runId,
        eventSeq: 2,
        workflowId: 'copilot.test-workflow',
        tenantId,
        occurredAt: new Date(),
        durationMs: 250,
        error: { code: 'boom', message: 'oops' },
      });

      const evts = await pool.query<{ event_type: string; payload: Record<string, unknown> }>(
        `SELECT event_type, payload FROM core.events WHERE aggregate_id = $1`,
        [runId],
      );
      expect(evts.rows.map((r) => r.event_type)).toEqual(['copilot.workflow.run.failed']);
      expect((evts.rows[0]!.payload.error as { code: string }).code).toBe('boom');
    });
  });
});

describe('onLifecycleEvent — terminal branches', () => {
  it('run-resumed flips status back to running and clears suspend_reason', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const runId = randomUUID();
      const tenantId = randomUUID();
      const userId = randomUUID();
      await onLifecycleEvent(
        pool,
        baseRunStarted({ runId, eventSeq: 1, tenantId, startedBy: userId }),
      );
      // simulate a suspend so we have a non-null suspend_reason to clear
      await onLifecycleEvent(pool, {
        kind: 'run-suspended',
        runId,
        eventSeq: 2,
        workflowId: 'copilot.test-workflow',
        tenantId,
        occurredAt: new Date(),
        stepId: 'await-approval',
        suspendReason: 'hitl_pending',
        proposedPayload: {},
        approverUserId: userId,
        fallbackApproverUserId: null,
        surfaceCanvas: true,
        surfaceChatThreadId: null,
        expiresAt: new Date(Date.now() + 86400000),
      });
      await onLifecycleEvent(pool, {
        kind: 'run-resumed',
        runId,
        eventSeq: 3,
        workflowId: 'copilot.test-workflow',
        tenantId,
        occurredAt: new Date('2026-05-21T00:02:00Z'),
      });
      const r = await pool.query(
        `SELECT status, suspend_reason FROM copilot.workflow_runs WHERE run_id = $1`,
        [runId],
      );
      expect(r.rows[0]!.status).toBe('running');
      expect(r.rows[0]!.suspend_reason).toBeNull();
    });
  });

  it.each([
    ['run-completed', 'success'],
    ['run-failed', 'failed'],
    ['run-canceled', 'canceled'],
  ] as const)('%s sets terminal status and duration', async (kind, expectedStatus) => {
    await withCopilotTestDb(async ({ pool }) => {
      const runId = randomUUID();
      const tenantId = randomUUID();
      const userId = randomUUID();
      await onLifecycleEvent(
        pool,
        baseRunStarted({ runId, eventSeq: 1, tenantId, startedBy: userId }),
      );
      const occurredAt = new Date();
      const terminal: MastraLifecycleEvent =
        kind === 'run-completed'
          ? {
              kind,
              runId,
              eventSeq: 2,
              workflowId: 'x',
              tenantId,
              occurredAt,
              durationMs: 500,
              outcome: 'success',
              summary: {},
            }
          : kind === 'run-failed'
            ? {
                kind,
                runId,
                eventSeq: 2,
                workflowId: 'x',
                tenantId,
                occurredAt,
                durationMs: 500,
                error: { code: 'boom', message: 'oops' },
              }
            : {
                kind: 'run-canceled',
                runId,
                eventSeq: 2,
                workflowId: 'x',
                tenantId,
                occurredAt,
                durationMs: 500,
              };
      await onLifecycleEvent(pool, terminal);
      const r = await pool.query(
        `SELECT status, finished_at, duration_ms, error_summary FROM copilot.workflow_runs WHERE run_id = $1`,
        [runId],
      );
      expect(r.rows[0]!.status).toBe(expectedStatus);
      expect(r.rows[0]!.duration_ms).toBe(500);
      expect(r.rows[0]!.finished_at).not.toBeNull();
      if (kind === 'run-failed') {
        expect(r.rows[0]!.error_summary).toContain('oops');
      }
    });
  });
});
