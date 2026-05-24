/**
 * Unit tests for the task-embedding CDC subscriber handlers.
 *
 * No DB required — handlers are invoked with a fake ctx whose tx.execute spy
 * records the graphile_worker.add_job call arguments.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  handleTaskCreated,
  handleTaskDeleted,
  handleTaskUpdated,
} from '../../../src/backend/subscribers/task-embedding.ts';

function makeFakeCtx() {
  const executeSpy = vi.fn().mockResolvedValue({ rows: [] });
  const ctx = {
    tx: {
      execute: executeSpy,
    },
  };
  return { ctx, executeSpy };
}

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
      after: {
        task_id: TASK_ID,
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
      task_id: TASK_ID,
      changed_fields: changedFields,
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
      task_id: TASK_ID,
    },
  };
}

describe('handleTaskCreated', () => {
  it('enqueues planner.embed_task with correct jobKey + jobKeyMode replace + maxAttempts 10', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await handleTaskCreated(makeCreatedEvent() as never, ctx as never);

    expect(executeSpy).toHaveBeenCalledOnce();
    const sqlArg = executeSpy.mock.calls[0]![0];
    const serialised = JSON.stringify(sqlArg);
    expect(serialised).toContain('planner.embed_task');
    expect(serialised).toContain(`planner.embed_task:${TENANT_ID}:${TASK_ID}`);
    expect(serialised).toContain('replace');
    expect(serialised).toContain('10');
  });

  it('passes tenant_id + task_id + event_id in payload', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await handleTaskCreated(makeCreatedEvent() as never, ctx as never);

    const sqlArg = executeSpy.mock.calls[0]![0];
    const serialised = JSON.stringify(sqlArg);
    expect(serialised).toContain(TENANT_ID);
    expect(serialised).toContain(TASK_ID);
    expect(serialised).toContain(EVENT_ID);
  });
});

describe('handleTaskDeleted', () => {
  it('enqueues planner.embed_task even for deleted tasks (worker handles tombstone)', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await handleTaskDeleted(makeDeletedEvent() as never, ctx as never);

    expect(executeSpy).toHaveBeenCalledOnce();
    const serialised = JSON.stringify(executeSpy.mock.calls[0]![0]);
    expect(serialised).toContain('planner.embed_task');
    expect(serialised).toContain(`planner.embed_task:${TENANT_ID}:${TASK_ID}`);
  });
});

describe('handleTaskUpdated', () => {
  it('does NOT enqueue when changed_fields contains only non-embedded fields', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await handleTaskUpdated(
      makeUpdatedEvent(['due_at', 'percent_complete']) as never,
      ctx as never,
    );
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('enqueues when changed_fields includes "title"', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await handleTaskUpdated(makeUpdatedEvent(['title', 'priority_number']) as never, ctx as never);
    expect(executeSpy).toHaveBeenCalledOnce();
  });

  it('enqueues when changed_fields includes "description"', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await handleTaskUpdated(makeUpdatedEvent(['description']) as never, ctx as never);
    expect(executeSpy).toHaveBeenCalledOnce();
  });

  it('enqueues when changed_fields includes "skill_tags"', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await handleTaskUpdated(makeUpdatedEvent(['skill_tags']) as never, ctx as never);
    expect(executeSpy).toHaveBeenCalledOnce();
  });

  it('enqueues with jobKey replace + maxAttempts 10 when relevant field changes', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await handleTaskUpdated(makeUpdatedEvent(['title']) as never, ctx as never);
    const serialised = JSON.stringify(executeSpy.mock.calls[0]![0]);
    expect(serialised).toContain(`planner.embed_task:${TENANT_ID}:${TASK_ID}`);
    expect(serialised).toContain('replace');
    expect(serialised).toContain('10');
  });
});
