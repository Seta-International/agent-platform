import { requiredPermissionFor } from '@seta/copilot-sdk';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createUser } from '@seta/identity';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { createGroup, createPlan, createTask } from '@seta/planner';
import { plannerAssignTaskTool } from '@seta/planner/agent-tools';
import { describe, expect, it } from 'vitest';
import { makeToolContext, withCopilotTestDb } from '../test-helpers.ts';

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

describe('planner_assignTask tool', () => {
  it('assigns a user to a task', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });

      // Create assignee projection for admin
      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
         VALUES ($1, $2, 'Admin', 'admin@demo.local', ARRAY[]::text[], 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [admin_user_id, tenant_id],
      );

      // Create a second user to assign
      const assigneeResult = await createUser(
        {
          tenant_id,
          email: 'assignee@demo.local',
          name: 'Assignee User',
          password: 'test-password',
        },
        { type: 'user', user_id: admin_user_id },
      );

      // Create assignee projection for the assignee
      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
         VALUES ($1, $2, 'Assignee User', 'assignee@demo.local', ARRAY[]::text[], 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [assigneeResult.user_id, tenant_id],
      );

      const group = await createGroup({ tenant_id, name: 'Test Group', session });
      const plan = await createPlan({ group_id: group.id, name: 'Test Plan', session });
      const task = await createTask({
        plan_id: plan.id,
        title: 'Task to assign',
        session,
      });

      const result = (await plannerAssignTaskTool.execute!(
        { taskId: task.id, assigneeUserId: assigneeResult.user_id },
        makeToolContext({ user_id: admin_user_id }),
      )) as {
        assignment: {
          taskId: string;
          assigneeUserId: string;
        };
      };

      expect(result.assignment.taskId).toBe(task.id);
      expect(result.assignment.assigneeUserId).toBe(assigneeResult.user_id);

      // Verify the assignment was actually created in the DB
      const { rows } = await pool.query(
        `SELECT * FROM planner.task_assignments WHERE task_id = $1 AND user_id = $2`,
        [task.id, assigneeResult.user_id],
      );
      expect(rows).toHaveLength(1);
    });
  });

  it('is registered with permission planner.task.assign', () => {
    expect(requiredPermissionFor(plannerAssignTaskTool)).toBe('planner.task.assign');
  });

  it('throws when actor has no planner role', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const adminSession = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });

      // Create assignee projection for admin
      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
         VALUES ($1, $2, 'Admin', 'admin@demo.local', ARRAY[]::text[], 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [admin_user_id, tenant_id],
      );

      // Create a contributor user (no assign permission)
      const contributorResult = await createUser(
        {
          tenant_id,
          email: 'contributor@demo.local',
          name: 'Contributor',
          password: 'test-password',
        },
        { type: 'user', user_id: admin_user_id },
      );

      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
         VALUES ($1, $2, 'Contributor', 'contributor@demo.local', ARRAY[]::text[], 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [contributorResult.user_id, tenant_id],
      );

      const group = await createGroup({ tenant_id, name: 'Test Group', session: adminSession });
      const plan = await createPlan({
        group_id: group.id,
        name: 'Test Plan',
        session: adminSession,
      });
      const task = await createTask({
        plan_id: plan.id,
        title: 'Task to assign',
        session: adminSession,
      });

      // The tool will call buildActorSession which will check permissions
      await expect(
        plannerAssignTaskTool.execute!(
          { taskId: task.id, assigneeUserId: admin_user_id },
          makeToolContext({ user_id: contributorResult.user_id }),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});
