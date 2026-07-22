import { requiredPermissionFor } from '@seta/agent-sdk';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { createGroup, createPlan, createTask } from '@seta/planner';
import { plannerGetUserActivityTool } from '@seta/planner/agent-tools';
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

describe('planner_getUserActivity tool', () => {
  it("returns a user's recent planner events", async () => {
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
      await createTask({ plan_id: plan.id, title: 'A', session });

      const res = (await plannerGetUserActivityTool.execute!(
        { userId: admin_user_id },
        makeToolContext({ user_id: admin_user_id, tenant_id }),
      )) as { events: Array<{ eventType: string; occurredAt: string }> };

      expect(res.events.length).toBeGreaterThan(0);
      expect(res.events[0]!.eventType).toBeTruthy();
    });
  });

  it("defaults to the caller's own activity when no user is specified", async () => {
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
      await createTask({ plan_id: plan.id, title: 'A', session });

      const res = (await plannerGetUserActivityTool.execute!(
        {},
        makeToolContext({ user_id: admin_user_id, tenant_id }),
      )) as { events: Array<{ eventType: string }> };

      expect(res.events.length).toBeGreaterThan(0);
    });
  });

  it('resolves a person by name into their activity', async () => {
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
         VALUES ($1, $2, 'Gandalf Grey', 'gandalf@demo.local', 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [admin_user_id, tenant_id],
      );

      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      await createTask({ plan_id: plan.id, title: 'A', session });

      const res = (await plannerGetUserActivityTool.execute!(
        { userName: 'Gandalf' },
        makeToolContext({ user_id: admin_user_id, tenant_id }),
      )) as { events: Array<{ eventType: string }> };

      expect(res.events.length).toBeGreaterThan(0);
    });
  });

  it('returns an error when a name matches multiple people', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, availability_status, timezone)
         VALUES
           ($1, $3, 'Sammy Lee', 'sammy@demo.local', 'available', 'UTC'),
           ($2, $3, 'Samuel Reed', 'samuel@demo.local', 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [crypto.randomUUID(), crypto.randomUUID(), tenant_id],
      );

      const res = (await plannerGetUserActivityTool.execute!(
        { userName: 'Sam' },
        makeToolContext({ user_id: admin_user_id, tenant_id }),
      )) as { error?: string };

      expect(res.error).toMatch(/multiple/i);
    });
  });

  it('returns an error when a name matches nobody', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });

      const res = (await plannerGetUserActivityTool.execute!(
        { userName: 'Nobody Here' },
        makeToolContext({ user_id: admin_user_id, tenant_id }),
      )) as { error?: string };

      expect(res.error).toMatch(/no member|couldn't find|not found/i);
    });
  });

  it('is registered with permission planner.reporting.read', () => {
    expect(requiredPermissionFor(plannerGetUserActivityTool)).toBe('planner.reporting.read');
  });
});
