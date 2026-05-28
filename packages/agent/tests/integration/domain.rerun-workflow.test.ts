import { randomUUID } from 'node:crypto';
import type { Mastra } from '@mastra/core';
import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';
import { rerunWorkflow } from '../../src/backend/domain/rerun-workflow.ts';
import type { SessionLike } from '../../src/backend/types.ts';
import { onLifecycleEvent } from '../../src/backend/workflows/_infra/lifecycle-hook.ts';
import { withAgentTestDb } from '../helpers.ts';

function makeRequestContext(session: SessionLike): RequestContext {
  const ctx = new RequestContext();
  ctx.set('actor', { type: 'user' as const, user_id: session.user_id });
  ctx.set('tenant_id', session.tenant_id);
  return ctx;
}

function sessionWith(perms: string[], tenantId = randomUUID(), userId = randomUUID()): SessionLike {
  return {
    tenant_id: tenantId,
    user_id: userId,
    effective_permissions: new Set(perms),
    role_summary: { roles: [], cross_tenant_read: false },
  };
}

async function seedParent(
  pool: import('pg').Pool,
  args: { runId: string; tenantId: string; startedBy: string; inputSummary?: unknown },
): Promise<void> {
  await onLifecycleEvent(pool, {
    kind: 'run-started',
    runId: args.runId,
    eventSeq: 1,
    workflowId: 'agent.x',
    tenantId: args.tenantId,
    startedBy: args.startedBy,
    startedVia: 'event',
    parentThreadId: null,
    parentRunId: null,
    sourceEventId: null,
    inputSummary: args.inputSummary ?? { taskRef: { taskId: 't-1' } },
    occurredAt: new Date(),
  });
}

function makeMastra(start: ReturnType<typeof vi.fn>, createRun?: ReturnType<typeof vi.fn>): Mastra {
  const createRunImpl =
    createRun ??
    vi.fn(async ({ runId }: { runId?: string }) => ({
      runId: runId ?? randomUUID(),
      start,
    }));
  return {
    getWorkflow: () => ({ createRun: createRunImpl }),
  } as unknown as Mastra;
}

describe('rerunWorkflow', () => {
  it('requires agent.workflow.run.execute.self', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const viewer = sessionWith([
        'agent.workflow.run.read.self',
        'agent.workflow.run.read.tenant',
      ]);
      const runId = randomUUID();
      await seedParent(pool, { runId, tenantId: viewer.tenant_id, startedBy: viewer.user_id });
      await expect(
        rerunWorkflow({
          session: viewer,
          runId,
          mastra: makeMastra(vi.fn()),
          pool,
          requestContext: makeRequestContext(viewer),
        }),
      ).rejects.toThrow(/forbidden|permission/i);
    });
  });

  it('returns null-ish (not_found) when parent does not exist', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = sessionWith(['agent.workflow.run.read.self', 'agent.workflow.run.execute.self']);
      await expect(
        rerunWorkflow({
          session: me,
          runId: randomUUID(),
          mastra: makeMastra(vi.fn()),
          pool,
          requestContext: makeRequestContext(me),
        }),
      ).rejects.toThrow(/not_found/i);
    });
  });

  it('creates a new run via Mastra and emits rerun_requested outbox event', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = sessionWith(['agent.workflow.run.read.self', 'agent.workflow.run.execute.self']);
      const parentRunId = randomUUID();
      await seedParent(pool, {
        runId: parentRunId,
        tenantId: me.tenant_id,
        startedBy: me.user_id,
        inputSummary: { taskRef: { taskId: 't-1' } },
      });

      const start = vi.fn().mockResolvedValue({ runId: 'new' });
      const newRunId = randomUUID();
      const createRun = vi.fn(async () => ({ runId: newRunId, start }));
      const mastra = makeMastra(start, createRun);

      const r = await rerunWorkflow({
        session: me,
        runId: parentRunId,
        mastra,
        pool,
        requestContext: makeRequestContext(me),
      });
      expect(r.newRunId).toBe(newRunId);
      expect(createRun).toHaveBeenCalledTimes(1);
      expect(start).toHaveBeenCalledTimes(1);
      const startArg = start.mock.calls[0]![0] as { inputData: Record<string, unknown> };
      expect(startArg.inputData.initiatedBy).toEqual(
        expect.objectContaining({ user_id: me.user_id, via: 'rerun' }),
      );

      const outbox = await pool.query<{ event_type: string; payload: Record<string, unknown> }>(
        `SELECT event_type, payload FROM core.events
          WHERE event_type = 'agent.workflow.run.rerun_requested'
            AND aggregate_id = $1`,
        [newRunId],
      );
      expect(outbox.rowCount).toBe(1);
      expect(outbox.rows[0]!.payload.parent_run_id).toBe(parentRunId);
      expect(outbox.rows[0]!.payload.requested_by).toBe(me.user_id);
      expect(outbox.rows[0]!.payload.workflow_id).toBe('agent.x');
    });
  });

  it('respects inputOverride when provided', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = sessionWith(['agent.workflow.run.read.self', 'agent.workflow.run.execute.self']);
      const parentRunId = randomUUID();
      await seedParent(pool, { runId: parentRunId, tenantId: me.tenant_id, startedBy: me.user_id });

      const start = vi.fn().mockResolvedValue({ runId: 'new' });
      const newRunId = randomUUID();
      const mastra = makeMastra(
        start,
        vi.fn(async () => ({ runId: newRunId, start })),
      );
      await rerunWorkflow({
        session: me,
        runId: parentRunId,
        inputOverride: { customField: 'custom' },
        mastra,
        pool,
        requestContext: makeRequestContext(me),
      });
      const startArg = start.mock.calls[0]![0] as { inputData: Record<string, unknown> };
      expect(startArg.inputData.customField).toBe('custom');
    });
  });
});
