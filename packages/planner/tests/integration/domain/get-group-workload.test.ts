import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { createGroup, createPlan, createTask, getGroupWorkload } from '@seta/planner';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import { describe, expect, it } from 'vitest';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

const _registry = buildRegistry(inventoryToManifests(INVENTORY));
function buildAdminSession(opts: {
  tenant_id: string;
  user_id: string;
  email: string;
}): SessionScope {
  const roles = ['org.admin'];
  const role_summary = { roles, cross_tenant_read: false, assignments: [] };
  return {
    session_id: crypto.randomUUID(),
    user_id: opts.user_id,
    tenant_id: opts.tenant_id,
    email: opts.email,
    display_name: 'Admin',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    permissions: resolvePermissions(_registry, roles, IMPLICIT_PERMISSIONS),
    assignments: [],
    group_ids: [],
    product_access: new Set<string>(),
    person_id: null,
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

describe('getGroupWorkload', () => {
  it('counts open tasks per assignee within a group', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });

      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, availability_status, timezone)
         VALUES ($1, $2, 'Admin', 'admin@demo.local', 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [admin_user_id, tenant_id],
      );

      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({ plan_id: plan.id, title: 'A', session });

      await pool.query(
        `INSERT INTO planner.task_assignments (task_id, user_id, tenant_id, assigned_by)
         VALUES ($1, $2, $3, $2)`,
        [task.id, admin_user_id, tenant_id],
      );

      const res = await getGroupWorkload({ group_id: group.id, session });
      const mine = res.rows.find((r) => r.userId === admin_user_id);
      expect(mine).toBeDefined();
      expect(mine!.openTaskCount).toBe(1);
      expect(mine!.displayName).toBe('Admin');
    });
  });

  it('returns empty rows for a group with no assignments', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });

      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, availability_status, timezone)
         VALUES ($1, $2, 'Admin', 'admin@demo.local', 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [admin_user_id, tenant_id],
      );

      const group = await createGroup({ tenant_id, name: 'Empty', session });
      const res = await getGroupWorkload({ group_id: group.id, session });
      expect(res.rows).toEqual([]);
    });
  });
});
