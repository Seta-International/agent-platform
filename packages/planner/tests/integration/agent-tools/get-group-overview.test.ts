import { requiredPermissionFor } from '@seta/agent-sdk';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createUser } from '@seta/identity';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { addGroupMember, createGroup, deleteGroup } from '@seta/planner';
import { plannerGetGroupOverviewTool } from '@seta/planner/agent-tools';
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

describe('planner_getGroupOverview tool', () => {
  it('declares the group.member.read permission', () => {
    expect(requiredPermissionFor(plannerGetGroupOverviewTool)).toBe('planner.group.member.read');
  });

  it('returns group name, members with roles, a total count, and plans', async () => {
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
         (user_id, tenant_id, display_name, email, availability_status, timezone)
         VALUES ($1, $2, 'Alice', 'alice@demo.local', 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [alice.user_id, tenant_id],
      );

      const group = await createGroup({ tenant_id, name: 'Engineering', session });
      await addGroupMember({ group_id: group.id, user_id: alice.user_id, session });

      const result = (await plannerGetGroupOverviewTool.execute!(
        { groupId: group.id },
        makeToolContext({ user_id: admin_user_id, tenant_id }),
      )) as {
        group: { name: string };
        totalMembers: number;
        members: { displayName: string; email: string; role: string }[];
        plans: { id: string; name: string }[];
      };

      expect(result.group).toEqual({ name: 'Engineering' });
      expect(result.totalMembers).toBeGreaterThanOrEqual(1);
      expect(result.members.some((m) => m.displayName === 'Alice')).toBe(true);
      expect(result.members.find((m) => m.displayName === 'Alice')?.email).toBe('alice@demo.local');
      expect(result.plans).toEqual([]);
    });
  });

  it('says an archived group is archived instead of answering from its data', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });

      const group = await createGroup({ tenant_id, name: 'Helios Migration', session });
      await deleteGroup({ group_id: group.id, expected_version: group.version, session });

      const res = (await plannerGetGroupOverviewTool.execute!(
        { groupId: group.id },
        makeToolContext({ user_id: admin_user_id, tenant_id }),
      )) as { group?: unknown; members?: unknown[]; error?: string };

      expect(res.error).toMatch(/archived/i);
      expect(res.error).toContain('Helios Migration');
      expect(res.group).toBeUndefined();
      expect(res.members).toBeUndefined();
    });
  });

  it('withholds the group from an actor who cannot read it', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });
      const group = await createGroup({ tenant_id, name: 'Engineering', session });

      // A non-member, non-admin user.
      const outsider = await createUser(
        { tenant_id, email: 'out@demo.local', name: 'Out', password: 'password123456' },
        { type: 'cli', user_id: null },
      );

      const res = (await plannerGetGroupOverviewTool.execute!(
        { groupId: group.id },
        makeToolContext({ user_id: outsider.user_id, tenant_id }),
      )) as { group?: unknown; members?: unknown[]; error?: string };

      expect(res.error).toMatch(/no accessible group/i);
      expect(res.group).toBeUndefined();
      expect(res.members).toBeUndefined();
    });
  });
});
