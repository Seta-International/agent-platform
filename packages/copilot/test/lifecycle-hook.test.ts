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
