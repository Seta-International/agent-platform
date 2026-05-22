import { randomUUID } from 'node:crypto';
import type { Mastra } from '@mastra/core';
import { describe, expect, it, vi } from 'vitest';
import { replayWorkflowFromStep } from '../src/backend/domain/replay-workflow-from-step.ts';
import type { SessionLike } from '../src/backend/types.ts';
import { onLifecycleEvent } from '../src/backend/workflows/lifecycle-hook.ts';
import { withCopilotTestDb } from './test-helpers.ts';

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
  args: { runId: string; tenantId: string; startedBy: string },
): Promise<void> {
  await onLifecycleEvent(pool, {
    kind: 'run-started',
    runId: args.runId,
    eventSeq: 1,
    workflowId: 'copilot.x',
    tenantId: args.tenantId,
    startedBy: args.startedBy,
    startedVia: 'event',
    parentThreadId: null,
    parentRunId: null,
    sourceEventId: null,
    inputSummary: {},
    occurredAt: new Date(),
  });
}

function makeMastra(
  timeTravel: ReturnType<typeof vi.fn>,
  createRun?: ReturnType<typeof vi.fn>,
): Mastra {
  const createRunImpl =
    createRun ??
    vi.fn(async ({ runId }: { runId?: string } = {}) => ({
      runId: runId ?? randomUUID(),
      timeTravel,
    }));
  return {
    getWorkflow: () => ({ createRun: createRunImpl }),
  } as unknown as Mastra;
}

describe('replayWorkflowFromStep', () => {
  it('requires copilot.workflow.run.execute.self (reuses rerun permission)', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const viewer = sessionWith(['copilot.workflow.run.read.self']);
      const runId = randomUUID();
      await seedParent(pool, {
        runId,
        tenantId: viewer.tenant_id,
        startedBy: viewer.user_id,
      });
      await expect(
        replayWorkflowFromStep({
          session: viewer,
          runId,
          stepId: 'b',
          payload: { x: 2 },
          mastra: makeMastra(vi.fn()),
        }),
      ).rejects.toThrow(/forbidden/i);
    });
  });

  it('returns not_found when parent run does not exist', async () => {
    await withCopilotTestDb(async ({ pool: _pool }) => {
      const me = sessionWith([
        'copilot.workflow.run.read.self',
        'copilot.workflow.run.execute.self',
      ]);
      await expect(
        replayWorkflowFromStep({
          session: me,
          runId: randomUUID(),
          stepId: 'x',
          payload: {},
          mastra: makeMastra(vi.fn()),
        }),
      ).rejects.toThrow(/not_found/i);
    });
  });

  it('happy path: calls Mastra time-travel with stepId + payload and returns a runId', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = sessionWith([
        'copilot.workflow.run.read.self',
        'copilot.workflow.run.execute.self',
      ]);
      const parentRunId = randomUUID();
      await seedParent(pool, {
        runId: parentRunId,
        tenantId: me.tenant_id,
        startedBy: me.user_id,
      });
      const timeTravel = vi.fn().mockResolvedValue({ status: 'success' });

      const out = await replayWorkflowFromStep({
        session: me,
        runId: parentRunId,
        stepId: 'b',
        payload: { x: 2 },
        mastra: makeMastra(timeTravel),
      });

      expect(out.newRunId).toBeDefined();
      expect(timeTravel).toHaveBeenCalledTimes(1);
      const callArg = (timeTravel.mock.calls[0]?.[0] ?? {}) as {
        inputData?: unknown;
        step?: unknown;
      };
      expect(callArg.step).toBe('b');
      expect(callArg.inputData).toEqual({ x: 2 });

      const outbox = await pool.query<{ event_type: string; payload: Record<string, unknown> }>(
        `SELECT event_type, payload FROM core.events
          WHERE event_type = 'copilot.workflow.run.replay_requested'
            AND aggregate_id = $1`,
        [out.newRunId],
      );
      expect(outbox.rowCount).toBe(1);
      expect(outbox.rows[0]!.payload.parent_run_id).toBe(parentRunId);
      expect(outbox.rows[0]!.payload.step_id).toBe('b');
      expect(outbox.rows[0]!.payload.requested_by).toBe(me.user_id);
    });
  });

  it('replay landing on a suspended step does not throw (Mastra re-emits suspension)', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = sessionWith([
        'copilot.workflow.run.read.self',
        'copilot.workflow.run.execute.self',
      ]);
      const parentRunId = randomUUID();
      await seedParent(pool, {
        runId: parentRunId,
        tenantId: me.tenant_id,
        startedBy: me.user_id,
      });
      const timeTravel = vi.fn().mockResolvedValue({ status: 'suspended' });

      const out = await replayWorkflowFromStep({
        session: me,
        runId: parentRunId,
        stepId: 'gate',
        payload: {},
        mastra: makeMastra(timeTravel),
      });
      expect(out.newRunId).toBeDefined();
      expect(timeTravel).toHaveBeenCalledWith(
        expect.objectContaining({ step: 'gate', inputData: {} }),
      );
    });
  });
});
