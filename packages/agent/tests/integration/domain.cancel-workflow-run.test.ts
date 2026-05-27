import { randomUUID } from 'node:crypto';
import type { Mastra } from '@mastra/core';
import { describe, expect, it, vi } from 'vitest';
import { cancelWorkflowRun } from '../../src/backend/domain/cancel-workflow-run.ts';
import type { SessionLike } from '../../src/backend/types.ts';
import { onLifecycleEvent } from '../../src/backend/workflows/_infra/lifecycle-hook.ts';
import { withAgentTestDb } from '../helpers.ts';

function sessionWith(perms: string[], tenantId = randomUUID(), userId = randomUUID()): SessionLike {
  return {
    tenant_id: tenantId,
    user_id: userId,
    effective_permissions: new Set(perms),
    role_summary: { roles: [], cross_tenant_read: false },
  };
}

async function seedRun(
  pool: import('pg').Pool,
  args: { runId: string; tenantId: string; startedBy: string },
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
    inputSummary: {},
    occurredAt: new Date(),
  });
}

function mastraWith(publish: ReturnType<typeof vi.fn>): Mastra {
  return { pubsub: { publish } } as unknown as Mastra;
}

describe('cancelWorkflowRun', () => {
  it('throws forbidden when the session lacks any cancel permission', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const viewer = sessionWith(['agent.workflow.run.read.self']);
      const runId = randomUUID();
      await seedRun(pool, { runId, tenantId: viewer.tenant_id, startedBy: viewer.user_id });

      await expect(
        cancelWorkflowRun({ session: viewer, runId, mastra: mastraWith(vi.fn()) }),
      ).rejects.toThrow(/forbidden/i);
    });
  });

  it('publishes workflow.cancel for own running run', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = sessionWith(['agent.workflow.run.read.self', 'agent.workflow.run.cancel.self']);
      const runId = randomUUID();
      await seedRun(pool, { runId, tenantId: me.tenant_id, startedBy: me.user_id });
      const publish = vi.fn().mockResolvedValue(undefined);

      await cancelWorkflowRun({ session: me, runId, mastra: mastraWith(publish) });

      expect(publish).toHaveBeenCalledWith(
        'workflows',
        expect.objectContaining({ type: 'workflow.cancel', runId }),
      );
    });
  });

  it("self scope cannot cancel another user's run; tenant scope can", async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const myUserId = randomUUID();
      const otherUserId = randomUUID();
      const runId = randomUUID();
      await seedRun(pool, { runId, tenantId, startedBy: otherUserId });

      const meSelf = sessionWith(
        ['agent.workflow.run.read.tenant', 'agent.workflow.run.cancel.self'],
        tenantId,
        myUserId,
      );
      await expect(
        cancelWorkflowRun({ session: meSelf, runId, mastra: mastraWith(vi.fn()) }),
      ).rejects.toThrow(/forbidden/i);

      const meTenant = sessionWith(
        ['agent.workflow.run.read.tenant', 'agent.workflow.run.cancel.tenant'],
        tenantId,
        myUserId,
      );
      const publish = vi.fn().mockResolvedValue(undefined);
      await cancelWorkflowRun({ session: meTenant, runId, mastra: mastraWith(publish) });
      expect(publish).toHaveBeenCalled();
    });
  });

  it('is a no-op when the run is already terminal', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = sessionWith(['agent.workflow.run.read.self', 'agent.workflow.run.cancel.self']);
      const runId = randomUUID();
      await seedRun(pool, { runId, tenantId: me.tenant_id, startedBy: me.user_id });
      await onLifecycleEvent(pool, {
        kind: 'run-completed',
        runId,
        eventSeq: 2,
        workflowId: 'agent.x',
        tenantId: me.tenant_id,
        occurredAt: new Date(),
        durationMs: 100,
        outcome: 'success',
        summary: {},
      });
      const publish = vi.fn();
      await cancelWorkflowRun({ session: me, runId, mastra: mastraWith(publish) });
      expect(publish).not.toHaveBeenCalled();
    });
  });
});
