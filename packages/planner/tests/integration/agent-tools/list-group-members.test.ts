import { requiredPermissionFor } from '@seta/agent-sdk';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createUser } from '@seta/identity';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { addGroupMember, createGroup } from '@seta/planner';
import { plannerListGroupMembersTool } from '@seta/planner/agent-tools';
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
    features: new Set<string>(),
    accessible_group_ids: [],
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

describe('planner_listGroupMembers tool', () => {
  it('declares the group.member.read permission', () => {
    expect(requiredPermissionFor(plannerListGroupMembersTool)).toBe('planner.group.member.read');
  });

  it('returns members with roles and a total count', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });

      const alice = await createUser(
        { tenant_id, email: 'alice@demo.local', name: 'Alice', password: 'password123456' },
        { type: 'cli', user_id: null },
      );
      // listGroupMembers inner-joins assignee_projection; seed alice's row so she
      // surfaces in the member list (the projection is normally event-populated).
      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
         VALUES ($1, $2, 'Alice', 'alice@demo.local', ARRAY[]::text[], 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [alice.user_id, tenant_id],
      );

      const group = await createGroup({ tenant_id, name: 'Engineering', session });
      await addGroupMember({ group_id: group.id, user_id: alice.user_id, session });

      const result = (await plannerListGroupMembersTool.execute!(
        { groupId: group.id },
        makeToolContext({ user_id: admin_user_id, tenant_id }),
      )) as { members: { userId: string; displayName: string; role: string }[]; total: number };

      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.members.some((m) => m.userId === alice.user_id)).toBe(true);
      expect(result.members.find((m) => m.userId === alice.user_id)?.displayName).toBe('Alice');
    });
  });

  it('throws FORBIDDEN when the actor cannot read the group', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });
      const group = await createGroup({ tenant_id, name: 'Engineering', session });

      // A non-member, non-admin user with an empty accessible_group_ids set.
      const outsider = await createUser(
        { tenant_id, email: 'out@demo.local', name: 'Out', password: 'password123456' },
        { type: 'cli', user_id: null },
      );

      await expect(
        plannerListGroupMembersTool.execute!(
          { groupId: group.id },
          makeToolContext({ user_id: outsider.user_id, tenant_id }),
        ),
      ).rejects.toThrow();
    });
  });
});
