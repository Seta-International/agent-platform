import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createUser } from '@seta/identity';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { assignTask, createGroup, createPlan, createTask } from '@seta/planner';
import { describe, expect, it } from 'vitest';
import { plannerGetOpenTaskCountSpec } from '../../../src/backend/agent-tools/get-open-task-count.ts';
import { withCopilotTestDb } from '../agent-tools-helpers.ts';

function buildAdminSession(opts: {
  tenant_id: string;
  user_id: string;
  email: string;
}): SessionScope {
  const role_summary = { roles: ['org.admin'], cross_tenant_read: false };
  return {
    session_id: crypto.randomUUID(),
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

async function seedProjection(
  pool: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  tenant_id: string,
  user_id: string,
  display_name: string,
  email: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO planner.assignee_projection
     (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
     VALUES ($1, $2, $3, $4, ARRAY[]::text[], 'available', 'UTC')
     ON CONFLICT (user_id) DO NOTHING`,
    [user_id, tenant_id, display_name, email],
  );
}

describe('planner_getOpenTaskCountForUser cross-module read', () => {
  it('returns count of open tasks (percent_complete < 100, not deleted) assigned to user', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });
      await seedProjection(pool, tenant_id, admin_user_id, 'Admin', 'admin@demo.local');

      const assignee = await createUser(
        {
          tenant_id,
          email: 'a@demo.local',
          name: 'Assignee',
          password: 'ChangeMe@2026',
        },
        { type: 'user', user_id: admin_user_id },
      );
      await seedProjection(pool, tenant_id, assignee.user_id, 'Assignee', 'a@demo.local');

      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });

      // 3 open tasks
      const openTasks = await Promise.all(
        [0, 1, 2].map((i) => createTask({ plan_id: plan.id, title: `open-${i}`, session })),
      );
      for (const t of openTasks) {
        await assignTask({ task_id: t.id, user_id: assignee.user_id, session });
      }

      // 1 completed task (percent_complete=100) — should not count.
      // Bypass updateTask's strict patch schema by setting the column directly.
      const done = await createTask({ plan_id: plan.id, title: 'done', session });
      await assignTask({ task_id: done.id, user_id: assignee.user_id, session });
      await pool.query(`UPDATE planner.tasks SET percent_complete = 100 WHERE id = $1`, [done.id]);

      // 1 soft-deleted task — should not count.
      const deleted = await createTask({ plan_id: plan.id, title: 'gone', session });
      await assignTask({ task_id: deleted.id, user_id: assignee.user_id, session });
      await pool.query(`UPDATE planner.tasks SET deleted_at = now() WHERE id = $1`, [deleted.id]);

      const out = await plannerGetOpenTaskCountSpec.execute({
        session: {
          tenant_id,
          user_id: admin_user_id,
          role_summary: { roles: ['org.admin'], cross_tenant_read: false },
        },
        input: { userId: assignee.user_id },
      });

      expect(out.openCount).toBe(3);
    });
  });

  it('is tenant-scoped: ignores tasks from another tenant for the same user_id', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const tenantA = await createTestTenantWithAdmin({ pool, slug: 'tenant-a' });
      const tenantB = await createTestTenantWithAdmin({ pool, slug: 'tenant-b' });
      const sessionA = buildAdminSession({
        tenant_id: tenantA.tenant_id,
        user_id: tenantA.admin_user_id,
        email: 'a-admin@demo.local',
      });
      await seedProjection(pool, tenantA.tenant_id, tenantA.admin_user_id, 'A', 'a@d.local');

      // Assignee in tenant A
      const a = await createUser(
        {
          tenant_id: tenantA.tenant_id,
          email: 'ax@d.local',
          name: 'AX',
          password: 'ChangeMe@2026',
        },
        { type: 'user', user_id: tenantA.admin_user_id },
      );
      await seedProjection(pool, tenantA.tenant_id, a.user_id, 'AX', 'ax@d.local');
      const groupA = await createGroup({
        tenant_id: tenantA.tenant_id,
        name: 'GA',
        session: sessionA,
      });
      const planA = await createPlan({ group_id: groupA.id, name: 'PA', session: sessionA });
      const taskA = await createTask({ plan_id: planA.id, title: 't', session: sessionA });
      await assignTask({ task_id: taskA.id, user_id: a.user_id, session: sessionA });

      const out = await plannerGetOpenTaskCountSpec.execute({
        session: {
          tenant_id: tenantB.tenant_id,
          user_id: tenantB.admin_user_id,
          role_summary: { roles: ['org.admin'], cross_tenant_read: false },
        },
        input: { userId: a.user_id },
      });

      expect(out.openCount).toBe(0);
    });
  });
});
