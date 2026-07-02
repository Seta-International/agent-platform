import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { listWorkflowRuns } from '../../src/backend/domain/list-workflow-runs.ts';
import { onLifecycleEvent } from '../../src/backend/workflows/_infra/lifecycle-hook.ts';
import { buildSession, withAgentTestDb } from '../helpers.ts';

async function seedRun(
  pool: import('pg').Pool,
  overrides: { runId?: string; tenantId: string; startedBy: string; workflowId?: string },
): Promise<string> {
  const runId = overrides.runId ?? randomUUID();
  await onLifecycleEvent(pool, {
    kind: 'run-started',
    runId,
    eventSeq: 1,
    workflowId: overrides.workflowId ?? 'agent.test',
    tenantId: overrides.tenantId,
    startedBy: overrides.startedBy,
    startedVia: 'event',
    parentThreadId: null,
    parentRunId: null,
    sourceEventId: null,
    inputSummary: {},
    occurredAt: new Date(),
  });
  return runId;
}

describe('listWorkflowRuns', () => {
  it('member (implicit only, no agent role) sees only their own runs', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
      const someoneElseInMyTenant = randomUUID();
      const otherTenant = randomUUID();

      const myRun = await seedRun(pool, { tenantId: me.tenant_id, startedBy: me.user_id });
      await seedRun(pool, { tenantId: me.tenant_id, startedBy: someoneElseInMyTenant });
      await seedRun(pool, { tenantId: otherTenant, startedBy: me.user_id });

      const result = await listWorkflowRuns({ session: me, scope: 'self' });
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]!.runId).toBe(myRun);
      expect(result.rows[0]!.startedBy).toBe(me.user_id);
      expect(result.rows[0]!.tenantId).toBe(me.tenant_id);
    });
  });

  it('implicit-only session requesting scope=tenant is forbidden', async () => {
    await withAgentTestDb(async ({ pool: _pool }) => {
      const me = buildSession();
      await expect(listWorkflowRuns({ session: me, scope: 'tenant' })).rejects.toThrow(
        /forbidden|permission/i,
      );
    });
  });

  it('agent.viewer @ tenant scope sees every run in the tenant', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession({
        assignments: [{ role_slug: 'agent.viewer', scope_kind: 'tenant' }],
      });
      await seedRun(pool, { tenantId: me.tenant_id, startedBy: randomUUID() });
      await seedRun(pool, { tenantId: me.tenant_id, startedBy: randomUUID() });
      await seedRun(pool, { tenantId: randomUUID(), startedBy: randomUUID() });

      const result = await listWorkflowRuns({ session: me, scope: 'tenant' });
      expect(result.rows).toHaveLength(2);
      for (const r of result.rows) expect(r.tenantId).toBe(me.tenant_id);
    });
  });

  it('agent.viewer @ self scope sees only their own runs and cannot request tenant scope', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession({
        assignments: [{ role_slug: 'agent.viewer', scope_kind: 'self' }],
      });
      const myRun = await seedRun(pool, { tenantId: me.tenant_id, startedBy: me.user_id });
      await seedRun(pool, { tenantId: me.tenant_id, startedBy: randomUUID() });

      const result = await listWorkflowRuns({ session: me, scope: 'self' });
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]!.runId).toBe(myRun);

      await expect(listWorkflowRuns({ session: me, scope: 'tenant' })).rejects.toThrow(
        /forbidden|permission/i,
      );
    });
  });

  it('org.viewer (cross_tenant_read) requesting scope=instance lists runs across tenants', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const admin = buildSession({
        assignments: [{ role_slug: 'org.viewer', scope_kind: 'tenant' }],
      });
      await seedRun(pool, { tenantId: admin.tenant_id, startedBy: randomUUID() });
      await seedRun(pool, { tenantId: randomUUID(), startedBy: randomUUID() });

      const result = await listWorkflowRuns({ session: admin, scope: 'instance' });
      expect(result.rows.length).toBeGreaterThanOrEqual(2);

      const lacking = buildSession();
      await expect(listWorkflowRuns({ session: lacking, scope: 'instance' })).rejects.toThrow(
        /forbidden|permission/i,
      );
    });
  });

  it('paginates by started_at desc using an opaque cursor', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
      for (let i = 0; i < 5; i++) {
        await seedRun(pool, { tenantId: me.tenant_id, startedBy: me.user_id });
        await new Promise((r) => setTimeout(r, 5));
      }
      const page1 = await listWorkflowRuns({ session: me, scope: 'self', limit: 2 });
      expect(page1.rows).toHaveLength(2);
      expect(page1.nextCursor).toBeTruthy();

      const page2 = await listWorkflowRuns({
        session: me,
        scope: 'self',
        limit: 2,
        cursor: page1.nextCursor ?? undefined,
      });
      expect(page2.rows).toHaveLength(2);
      const page1Ids = new Set(page1.rows.map((r) => r.runId));
      for (const r of page2.rows) expect(page1Ids.has(r.runId)).toBe(false);
    });
  });

  it('filters by status', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
      await seedRun(pool, { tenantId: me.tenant_id, startedBy: me.user_id });
      const completedRunId = await seedRun(pool, { tenantId: me.tenant_id, startedBy: me.user_id });
      await onLifecycleEvent(pool, {
        kind: 'run-completed',
        runId: completedRunId,
        eventSeq: 2,
        workflowId: 'agent.test',
        tenantId: me.tenant_id,
        occurredAt: new Date(),
        durationMs: 50,
        outcome: 'success',
        summary: {},
      });

      const runningOnly = await listWorkflowRuns({
        session: me,
        scope: 'self',
        filters: { status: ['running'] },
      });
      expect(runningOnly.rows.every((r) => r.status === 'running')).toBe(true);
      expect(runningOnly.rows.some((r) => r.runId === completedRunId)).toBe(false);

      const successOnly = await listWorkflowRuns({
        session: me,
        scope: 'self',
        filters: { status: ['success'] },
      });
      expect(successOnly.rows).toHaveLength(1);
      expect(successOnly.rows[0]!.runId).toBe(completedRunId);
    });
  });

  it('filters by workflowId so cursor pagination respects the definition', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
      const wantedId = 'agent.new-task-skill-tag';
      const otherId = 'agent.something-else';
      const wantedA = await seedRun(pool, {
        tenantId: me.tenant_id,
        startedBy: me.user_id,
        workflowId: wantedId,
      });
      const wantedB = await seedRun(pool, {
        tenantId: me.tenant_id,
        startedBy: me.user_id,
        workflowId: wantedId,
      });
      await seedRun(pool, {
        tenantId: me.tenant_id,
        startedBy: me.user_id,
        workflowId: otherId,
      });

      const result = await listWorkflowRuns({
        session: me,
        scope: 'self',
        filters: { workflowId: wantedId },
      });
      const returnedIds = new Set(result.rows.map((r) => r.runId));
      expect(returnedIds.has(wantedA)).toBe(true);
      expect(returnedIds.has(wantedB)).toBe(true);
      expect(result.rows.every((r) => r.workflowId === wantedId)).toBe(true);

      const paged = await listWorkflowRuns({
        session: me,
        scope: 'self',
        filters: { workflowId: wantedId },
        limit: 1,
      });
      expect(paged.rows).toHaveLength(1);
      expect(paged.nextCursor).not.toBeNull();
      expect(paged.rows[0]!.workflowId).toBe(wantedId);
    });
  });

  it('surfaces the latest approval decision (superseded + reason)', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
      const runId = await seedRun(pool, {
        tenantId: me.tenant_id,
        startedBy: me.user_id,
        workflowId: 'planner.assignBySkill',
      });
      await pool.query(
        `INSERT INTO agent.workflow_approvals
           (approval_id, run_id, step_id, proposed_payload,
            approver_user_id, status, decision_payload, expires_at, decided_at)
         VALUES (gen_random_uuid(), $1, 'assignBySkill.suggest', '{}'::jsonb,
                 $2, 'superseded',
                 jsonb_build_object('reason','task-assigned-elsewhere'),
                 now() + interval '1 hour', now())`,
        [runId, me.user_id],
      );

      const result = await listWorkflowRuns({ session: me, scope: 'self' });
      const row = result.rows.find((r) => r.runId === runId);
      expect(row).toBeDefined();
      expect(row!.latestApprovalKind).toBe('superseded');
      expect(row!.latestApprovalReason).toBe('task-assigned-elsewhere');
    });
  });

  it('returns null latestApproval* when the run has no approvals yet', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
      await seedRun(pool, { tenantId: me.tenant_id, startedBy: me.user_id });
      const result = await listWorkflowRuns({ session: me, scope: 'self' });
      expect(result.rows[0]!.latestApprovalKind).toBeNull();
      expect(result.rows[0]!.latestApprovalReason).toBeNull();
    });
  });
});
