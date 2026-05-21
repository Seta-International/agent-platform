import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getWorkflowRun } from '../src/backend/domain/get-workflow-run.ts';
import { getWorkflowRunSnapshot } from '../src/backend/domain/get-workflow-run-snapshot.ts';
import type { SessionLike } from '../src/backend/routes.ts';
import { buildMastra } from '../src/backend/runtime.ts';
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

async function seed(
  pool: import('pg').Pool,
  runId: string,
  tenantId: string,
  startedBy: string,
): Promise<void> {
  await onLifecycleEvent(pool, {
    kind: 'run-started',
    runId,
    eventSeq: 1,
    workflowId: 'copilot.x',
    tenantId,
    startedBy,
    startedVia: 'event',
    parentThreadId: null,
    parentRunId: null,
    sourceEventId: null,
    inputSummary: {},
    occurredAt: new Date(),
  });
}

describe('getWorkflowRun', () => {
  it('returns own run via read.self', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = sessionWith(['copilot.workflow.run.read.self']);
      const runId = randomUUID();
      await seed(pool, runId, me.tenant_id, me.user_id);
      const row = await getWorkflowRun({ session: me, runId });
      expect(row?.runId).toBe(runId);
      expect(row?.tenantId).toBe(me.tenant_id);
      expect(row?.startedBy).toBe(me.user_id);
    });
  });

  it('returns null for an other-tenant run (caller has read.self only)', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = sessionWith(['copilot.workflow.run.read.self']);
      const runId = randomUUID();
      await seed(pool, runId, randomUUID(), randomUUID());
      const row = await getWorkflowRun({ session: me, runId });
      expect(row).toBeNull();
    });
  });

  it('returns same-tenant other-user run when caller holds read.tenant', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const viewer = sessionWith([
        'copilot.workflow.run.read.self',
        'copilot.workflow.run.read.tenant',
      ]);
      const otherUser = randomUUID();
      const runId = randomUUID();
      await seed(pool, runId, viewer.tenant_id, otherUser);
      const row = await getWorkflowRun({ session: viewer, runId });
      expect(row?.runId).toBe(runId);
      expect(row?.startedBy).toBe(otherUser);
    });
  });

  it('returns any-tenant run when caller holds read.instance', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const admin = sessionWith([
        'copilot.workflow.run.read.self',
        'copilot.workflow.run.read.instance',
      ]);
      const runId = randomUUID();
      await seed(pool, runId, randomUUID(), randomUUID());
      const row = await getWorkflowRun({ session: admin, runId });
      expect(row?.runId).toBe(runId);
    });
  });

  it('returns null for a non-existent run', async () => {
    await withCopilotTestDb(async ({ pool: _pool }) => {
      const me = sessionWith(['copilot.workflow.run.read.self']);
      const row = await getWorkflowRun({ session: me, runId: randomUUID() });
      expect(row).toBeNull();
    });
  });
});

describe('getWorkflowRunSnapshot', () => {
  it('returns null when projection denies visibility', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const mastra = buildMastra({ pool, databaseUrl });
      await mastra.getStorage()!.init();
      const me = sessionWith(['copilot.workflow.run.read.self']);
      const runId = randomUUID();
      await seed(pool, runId, randomUUID(), randomUUID()); // foreign tenant
      const snap = await getWorkflowRunSnapshot({ session: me, runId, mastra });
      expect(snap).toBeNull();
    });
  });

  it('returns the snapshot when projection visibility passes and Mastra has the run', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const mastra = buildMastra({ pool, databaseUrl });
      const storage = mastra.getStorage()!;
      await storage.init();
      const workflowsStore = await storage.getStore('workflows');
      if (!workflowsStore) throw new Error('workflows store unavailable');

      const me = sessionWith(['copilot.workflow.run.read.self']);
      const runId = randomUUID();
      await seed(pool, runId, me.tenant_id, me.user_id);

      await workflowsStore.persistWorkflowSnapshot({
        workflowName: 'copilot.x',
        runId,
        snapshot: {
          runId,
          status: 'running',
          value: {},
          context: {},
          activePaths: [],
          activeStepsPath: {},
          serializedStepGraph: [],
          suspendedPaths: {},
          resumeLabels: {},
          waitingPaths: {},
          timestamp: Date.now(),
        } as Parameters<typeof workflowsStore.persistWorkflowSnapshot>[0]['snapshot'],
      });

      const snap = await getWorkflowRunSnapshot({ session: me, runId, mastra });
      expect(snap).toBeTruthy();
    });
  });
});
