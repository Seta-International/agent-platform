import { randomUUID } from 'node:crypto';
import { registerPendingAssignReader } from '@seta/copilot-sdk';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { createGroup, createPlan, createTask } from '@seta/planner';
import { plannerGetTaskTool } from '@seta/planner/agent-tools';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { makeToolContext, withCopilotTestDb } from '../agent-tools-helpers.ts';

// In production registerCopilot() registers the reader (it lives in
// packages/copilot/src/backend/domain). Here we register an inline reader
// bound to the per-test pool that withCopilotTestDb hands us — same SQL
// contract, no relative cross-package import.
function bindReader(pool: Pool): void {
  registerPendingAssignReader(async ({ taskId, tenantId }) => {
    const { rows } = await pool.query<{ run_id: string }>(
      `SELECT run_id FROM copilot.workflow_runs
        WHERE workflow_id = 'planner.assignBySkill'
          AND status = 'paused'
          AND tenant_id = $1::uuid
          AND input_summary @> jsonb_build_object('taskId', $2::text)
        ORDER BY started_at DESC
        LIMIT 1`,
      [tenantId, taskId],
    );
    return rows[0]?.run_id ?? null;
  });
}

function buildAdminSession(opts: {
  tenant_id: string;
  user_id: string;
  email: string;
}): SessionScope {
  const role_summary = { roles: ['org.admin'], cross_tenant_read: false };
  return {
    session_id: randomUUID(),
    user_id: opts.user_id,
    tenant_id: opts.tenant_id,
    email: opts.email,
    display_name: 'Admin',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    accessible_group_ids: [],
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

async function seedPausedAssignRun(
  pool: import('pg').Pool,
  opts: { tenantId: string; userId: string; taskId: string },
): Promise<string> {
  const runId = randomUUID();
  await pool.query(
    `INSERT INTO copilot.workflow_runs
       (run_id, workflow_id, tenant_id, started_by, started_via,
        input_summary, status, started_at)
     VALUES ($1, 'planner.assignBySkill', $2, $3, 'event',
             $4::jsonb, 'paused', now())`,
    [runId, opts.tenantId, opts.userId, JSON.stringify({ taskId: opts.taskId })],
  );
  return runId;
}

describe('planner_getTask — pendingAssignWorkflowRunId', () => {
  it('is null when no Suggest run is open for the task', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      bindReader(pool);
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });
      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
         VALUES ($1, $2, 'Admin', 'admin@demo.local', ARRAY[]::text[], 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [admin_user_id, tenant_id],
      );
      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({ plan_id: plan.id, title: 'T', session });

      const result = (await plannerGetTaskTool.execute!(
        { taskId: task.id },
        makeToolContext({ user_id: admin_user_id }),
      )) as { task: { pendingAssignWorkflowRunId: string | null } };

      expect(result.task.pendingAssignWorkflowRunId).toBeNull();
    });
  });

  it('returns the run_id when a paused planner.assignBySkill run exists for the task', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      bindReader(pool);
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });
      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
         VALUES ($1, $2, 'Admin', 'admin@demo.local', ARRAY[]::text[], 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [admin_user_id, tenant_id],
      );
      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({ plan_id: plan.id, title: 'T', session });
      const runId = await seedPausedAssignRun(pool, {
        tenantId: tenant_id,
        userId: admin_user_id,
        taskId: task.id,
      });

      const result = (await plannerGetTaskTool.execute!(
        { taskId: task.id },
        makeToolContext({ user_id: admin_user_id }),
      )) as { task: { pendingAssignWorkflowRunId: string | null } };

      expect(result.task.pendingAssignWorkflowRunId).toBe(runId);
    });
  });

  it('does not leak run_ids from a different tenant', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      bindReader(pool);
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });
      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
         VALUES ($1, $2, 'Admin', 'admin@demo.local', ARRAY[]::text[], 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [admin_user_id, tenant_id],
      );
      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({ plan_id: plan.id, title: 'T', session });

      // foreign tenant seeds a run for our taskId — must be invisible
      await seedPausedAssignRun(pool, {
        tenantId: randomUUID(),
        userId: randomUUID(),
        taskId: task.id,
      });

      const result = (await plannerGetTaskTool.execute!(
        { taskId: task.id },
        makeToolContext({ user_id: admin_user_id }),
      )) as { task: { pendingAssignWorkflowRunId: string | null } };

      expect(result.task.pendingAssignWorkflowRunId).toBeNull();
    });
  });

  it('ignores non-paused runs (running / success)', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      bindReader(pool);
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });
      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
         VALUES ($1, $2, 'Admin', 'admin@demo.local', ARRAY[]::text[], 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [admin_user_id, tenant_id],
      );
      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({ plan_id: plan.id, title: 'T', session });

      // a finished run for the same task should not surface as pending
      await pool.query(
        `INSERT INTO copilot.workflow_runs
           (run_id, workflow_id, tenant_id, started_by, started_via,
            input_summary, status, started_at, finished_at)
         VALUES ($1, 'planner.assignBySkill', $2, $3, 'event',
                 $4::jsonb, 'success', now(), now())`,
        [randomUUID(), tenant_id, admin_user_id, JSON.stringify({ taskId: task.id })],
      );

      const result = (await plannerGetTaskTool.execute!(
        { taskId: task.id },
        makeToolContext({ user_id: admin_user_id }),
      )) as { task: { pendingAssignWorkflowRunId: string | null } };

      expect(result.task.pendingAssignWorkflowRunId).toBeNull();
    });
  });
});
