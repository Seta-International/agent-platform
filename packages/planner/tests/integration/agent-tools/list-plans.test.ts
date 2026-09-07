import { requiredPermissionFor } from '@seta/agent-sdk';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { createGroup, createPlan, deleteGroup } from '@seta/planner';
import { plannerListPlansTool } from '@seta/planner/agent-tools';
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

describe('planner_listPlans tool', () => {
  it('declares the plan.read permission', () => {
    expect(requiredPermissionFor(plannerListPlansTool)).toBe('planner.plan.read');
  });

  it('returns plans in a group', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });
      const group = await createGroup({ tenant_id, name: 'Engineering', session });
      await createPlan({ group_id: group.id, name: 'Q3 Roadmap', session });
      await createPlan({ group_id: group.id, name: 'Billing Migration', session });

      const result = (await plannerListPlansTool.execute!(
        { groupId: group.id },
        makeToolContext({ user_id: admin_user_id, tenant_id }),
      )) as { plans: { id: string; name: string; groupId: string }[] };

      const names = result.plans.map((p) => p.name).sort();
      expect(names).toEqual(['Billing Migration', 'Q3 Roadmap']);
      expect(result.plans.every((p) => p.groupId === group.id)).toBe(true);
    });
  });

  it('omits plans owned by an archived group when listing across groups', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });

      const live = await createGroup({ tenant_id, name: 'Engineering', session });
      await createPlan({ group_id: live.id, name: 'Q3 Roadmap', session });

      const gone = await createGroup({ tenant_id, name: 'Helios Migration', session });
      await createPlan({ group_id: gone.id, name: 'Helios Cutover', session });
      await deleteGroup({ group_id: gone.id, expected_version: gone.version, session });

      const result = (await plannerListPlansTool.execute!(
        {},
        makeToolContext({ user_id: admin_user_id, tenant_id }),
      )) as { plans: { id: string; name: string; groupId: string }[] };

      expect(result.plans.map((p) => p.name)).toEqual(['Q3 Roadmap']);
    });
  });
});
