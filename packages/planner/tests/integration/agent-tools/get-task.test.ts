import { requiredPermissionFor } from '@seta/agent-sdk';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { createGroup, createPlan, createTask } from '@seta/planner';
import { plannerGetTaskTool } from '@seta/planner/agent-tools';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import { describe, expect, it } from 'vitest';
import { makeToolContext, withAgentTestDb } from '../agent-tools-helpers.ts';

const _registry = buildRegistry(inventoryToManifests(INVENTORY));
function buildAdminSession(opts: {
  tenant_id: string;
  user_id: string;
  email: string;
}): SessionScope {
  const roles = ['org.admin'];
  const role_summary = { roles, cross_tenant_read: false };
  return {
    session_id: crypto.randomUUID(),
    user_id: opts.user_id,
    tenant_id: opts.tenant_id,
    email: opts.email,
    display_name: 'Admin',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    permissions: resolvePermissions(_registry, roles, IMPLICIT_PERMISSIONS),
    accessible_group_ids: [],
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

describe('planner_getTask tool', () => {
  it('returns the task by id', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });

      // Create assignee projection for admin (required by planner domain functions)
      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
         VALUES ($1, $2, 'Admin', 'admin@demo.local', ARRAY[]::text[], 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [admin_user_id, tenant_id],
      );

      const group = await createGroup({ tenant_id, name: 'Test Group', session });
      const plan = await createPlan({ group_id: group.id, name: 'Test Plan', session });
      const task = await createTask({
        plan_id: plan.id,
        title: 'Wire SSE backpressure',
        session,
      });

      const result = (await plannerGetTaskTool.execute!(
        { taskRef: task.id },
        makeToolContext({ user_id: admin_user_id, tenant_id }),
      )) as {
        task: {
          taskId: string;
          tenantId: string;
          groupId: string;
          title: string;
          description: string | null;
          labels: Array<{ id: string; name: string; color: string }>;
        };
      };

      expect(result.task.taskId).toBe(task.id);
      expect(result.task.tenantId).toBe(tenant_id);
      expect(result.task.groupId).toBe(group.id);
      expect(result.task.title).toBe('Wire SSE backpressure');
      expect(result.task.description).toBeNull();
      expect(result.task.labels).toEqual([]);
    });
  });

  it('is registered with permission planner.task.read', () => {
    expect(requiredPermissionFor(plannerGetTaskTool)).toBe('planner.task.read');
  });

  it('throws when task does not exist', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      await expect(
        plannerGetTaskTool.execute!(
          { taskRef: crypto.randomUUID() },
          makeToolContext({ user_id: admin_user_id, tenant_id }),
        ),
      ).rejects.toThrow();
    });
  });
});
