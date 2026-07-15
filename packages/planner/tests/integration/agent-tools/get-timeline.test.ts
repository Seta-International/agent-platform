import { requiredPermissionFor } from '@seta/agent-sdk';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { createGroup, createPlan, createTask } from '@seta/planner';
import { plannerGetTimelineTool } from '@seta/planner/agent-tools';
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

describe('planner_getTimeline tool', () => {
  it('returns tasks with dates and flags dependencies unavailable', async () => {
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
      await createTask({
        plan_id: plan.id,
        title: 'Dated task',
        session,
        due_at: '2026-08-01T00:00:00Z',
      });

      const res = (await plannerGetTimelineTool.execute!(
        { planId: plan.id, from: '2026-07-01T00:00:00Z', to: '2026-09-01T00:00:00Z' },
        makeToolContext({ user_id: admin_user_id, tenant_id }),
      )) as {
        items: Array<{
          taskId: string;
          title: string;
          startAt: string | null;
          dueAt: string | null;
        }>;
        dependenciesAvailable: boolean;
        totalCount: number;
      };

      expect(res.dependenciesAvailable).toBe(false);
      expect(res.items.some((i) => i.dueAt !== null)).toBe(true);
      expect(res.totalCount).toBeGreaterThanOrEqual(1);
    });
  });

  it('is registered with permission planner.task.read', () => {
    expect(requiredPermissionFor(plannerGetTimelineTool)).toBe('planner.task.read');
  });
});
