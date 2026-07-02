import { randomUUID } from 'node:crypto';
import type { Mastra } from '@mastra/core';
import { describe, expect, it, vi } from 'vitest';
import { cancelWorkflowRun } from '../../src/backend/domain/cancel-workflow-run.ts';
import { onLifecycleEvent } from '../../src/backend/workflows/_infra/lifecycle-hook.ts';
import { buildSession, withAgentTestDb } from '../helpers.ts';

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
  it('member (implicit only) cancels their own running run', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
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

  it("member (tenant-wide read, self-only cancel) cannot cancel another user's run; agent.admin @ tenant can", async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const otherUserId = randomUUID();
      const runId = randomUUID();
      await seedRun(pool, { runId, tenantId, startedBy: otherUserId });

      // Tenant-wide read (so the run is visible) but only self-scoped cancel —
      // isolates the cancel-specific ownership check from the read gate.
      const member = buildSession({
        tenantId,
        assignments: [
          { role_slug: 'agent.viewer', scope_kind: 'tenant' },
          { role_slug: 'agent.member', scope_kind: 'self' },
        ],
      });
      await expect(
        cancelWorkflowRun({ session: member, runId, mastra: mastraWith(vi.fn()) }),
      ).rejects.toThrow(/forbidden/i);

      const admin = buildSession({
        tenantId,
        assignments: [{ role_slug: 'agent.admin', scope_kind: 'tenant' }],
      });
      const publish = vi.fn().mockResolvedValue(undefined);
      await cancelWorkflowRun({ session: admin, runId, mastra: mastraWith(publish) });
      expect(publish).toHaveBeenCalled();
    });
  });

  it('is a no-op when the run is already terminal', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
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
