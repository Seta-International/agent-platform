/**
 * Unit tests for the refresh-task CDC subscribers.
 *
 * No DB required — handlers are invoked with a fake ctx whose tx.execute spy
 * records the graphile_worker.add_job call arguments.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  refreshTaskCreatedSubscriber,
  refreshTaskDeletedSubscriber,
  refreshTaskUpdatedSubscriber,
} from '../../src/backend/embeddings/subscribers/refresh-task.ts';

// ── Fake ctx ────────────────────────────────────────────────────────────────

function makeFakeCtx() {
  const executeSpy = vi.fn().mockResolvedValue({ rows: [] });
  const ctx = {
    tx: {
      execute: executeSpy,
    },
  };
  return { ctx, executeSpy };
}

// ── Event factories ─────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const TASK_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const EVENT_ID = 'cccccccc-0000-0000-0000-000000000003';

function makeCreatedEvent() {
  return {
    id: EVENT_ID,
    occurredAt: new Date(),
    tenantId: TENANT_ID,
    aggregateType: 'planner.task' as const,
    aggregateId: TASK_ID,
    eventType: 'planner.task.created' as const,
    eventVersion: 1 as const,
    payload: {
      actor: { type: 'user' as const, user_id: 'u1' },
      group_id: 'g1',
      after: {
        task_id: TASK_ID,
        plan_id: 'p1',
        group_id: 'g1',
        bucket_id: null,
        title: 'Write tests',
        description: 'Important task',
        priority_number: 1 as const,
        percent_complete: 0,
        is_deferred: false,
        preview_type: 'automatic' as const,
        start_at: null,
        due_at: null,
        order_hint: null,
        assignee_priority: null,
        skill_tags: ['ts'],
        review_state: null,
        external_source: 'native' as const,
        external_id: null,
        created_by: 'u1',
      },
    },
  };
}

function makeUpdatedEvent(changedFields: string[]) {
  return {
    id: EVENT_ID,
    occurredAt: new Date(),
    tenantId: TENANT_ID,
    aggregateType: 'planner.task' as const,
    aggregateId: TASK_ID,
    eventType: 'planner.task.updated' as const,
    eventVersion: 1 as const,
    payload: {
      actor: { type: 'user' as const, user_id: 'u1' },
      group_id: 'g1',
      task_id: TASK_ID,
      plan_id: 'p1',
      before: {},
      after: {},
      changed_fields: changedFields,
      version_before: 1,
      version_after: 2,
    },
  };
}

function makeDeletedEvent() {
  return {
    id: EVENT_ID,
    occurredAt: new Date(),
    tenantId: TENANT_ID,
    aggregateType: 'planner.task' as const,
    aggregateId: TASK_ID,
    eventType: 'planner.task.deleted' as const,
    eventVersion: 1 as const,
    payload: {
      actor: { type: 'user' as const, user_id: 'u1' },
      group_id: 'g1',
      task_id: TASK_ID,
      plan_id: 'p1',
      version_before: 1,
      deleted_at: new Date().toISOString(),
    },
  };
}

// ── Helper: extract the SQL string passed to execute() ──────────────────────

function extractSql(executeSpy: ReturnType<typeof vi.fn>): string {
  expect(executeSpy).toHaveBeenCalledOnce();
  const arg = executeSpy.mock.calls[0][0] as { sql?: string; queryChunks?: { value?: string }[] };
  // drizzle sql`` template produces an object with .sql or .queryChunks
  const text = arg.sql ?? JSON.stringify(arg);
  return text;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('refreshTaskCreatedSubscriber', () => {
  it('metadata', () => {
    expect(refreshTaskCreatedSubscriber.event).toBe('planner.task.created');
    expect(refreshTaskCreatedSubscriber.eventVersion).toBe(1);
    expect(typeof refreshTaskCreatedSubscriber.subscription).toBe('string');
  });

  it('enqueues embed_task with correct jobKey + jobKeyMode replace + maxAttempts 10', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await refreshTaskCreatedSubscriber.handler(makeCreatedEvent() as never, ctx as never);

    expect(executeSpy).toHaveBeenCalledOnce();
    const sqlArg = executeSpy.mock.calls[0][0];
    // The SQL template contains embed_task and the job key
    const serialised = JSON.stringify(sqlArg);
    expect(serialised).toContain('embed_task');
    expect(serialised).toContain(`embed_task:${TENANT_ID}:${TASK_ID}`);
    expect(serialised).toContain('replace');
    expect(serialised).toContain('10');
  });

  it('passes tenant_id + task_id + event_id in payload', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await refreshTaskCreatedSubscriber.handler(makeCreatedEvent() as never, ctx as never);

    const sqlArg = executeSpy.mock.calls[0][0];
    const serialised = JSON.stringify(sqlArg);
    expect(serialised).toContain(TENANT_ID);
    expect(serialised).toContain(TASK_ID);
    expect(serialised).toContain(EVENT_ID);
  });
});

describe('refreshTaskDeletedSubscriber', () => {
  it('metadata', () => {
    expect(refreshTaskDeletedSubscriber.event).toBe('planner.task.deleted');
    expect(refreshTaskDeletedSubscriber.eventVersion).toBe(1);
  });

  it('enqueues embed_task even for deleted tasks (worker handles tombstone)', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await refreshTaskDeletedSubscriber.handler(makeDeletedEvent() as never, ctx as never);

    expect(executeSpy).toHaveBeenCalledOnce();
    const serialised = JSON.stringify(executeSpy.mock.calls[0][0]);
    expect(serialised).toContain('embed_task');
    expect(serialised).toContain(`embed_task:${TENANT_ID}:${TASK_ID}`);
  });
});

describe('refreshTaskUpdatedSubscriber', () => {
  it('metadata', () => {
    expect(refreshTaskUpdatedSubscriber.event).toBe('planner.task.updated');
    expect(refreshTaskUpdatedSubscriber.eventVersion).toBe(1);
  });

  it('does NOT enqueue when changed_fields contains only non-embedded fields', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await refreshTaskUpdatedSubscriber.handler(
      makeUpdatedEvent(['due_at', 'percent_complete']) as never,
      ctx as never,
    );
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('enqueues when changed_fields includes "title"', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await refreshTaskUpdatedSubscriber.handler(
      makeUpdatedEvent(['title', 'priority_number']) as never,
      ctx as never,
    );
    expect(executeSpy).toHaveBeenCalledOnce();
  });

  it('enqueues when changed_fields includes "description"', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await refreshTaskUpdatedSubscriber.handler(
      makeUpdatedEvent(['description']) as never,
      ctx as never,
    );
    expect(executeSpy).toHaveBeenCalledOnce();
  });

  it('enqueues when changed_fields includes "skill_tags"', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await refreshTaskUpdatedSubscriber.handler(
      makeUpdatedEvent(['skill_tags']) as never,
      ctx as never,
    );
    expect(executeSpy).toHaveBeenCalledOnce();
  });

  it('enqueues with jobKey replace + maxAttempts 10 when relevant field changes', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await refreshTaskUpdatedSubscriber.handler(makeUpdatedEvent(['title']) as never, ctx as never);
    const serialised = JSON.stringify(executeSpy.mock.calls[0][0]);
    expect(serialised).toContain(`embed_task:${TENANT_ID}:${TASK_ID}`);
    expect(serialised).toContain('replace');
    expect(serialised).toContain('10');
  });
});
