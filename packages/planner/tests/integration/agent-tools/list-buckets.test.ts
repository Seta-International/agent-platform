import { requiredPermissionFor } from '@seta/agent-sdk';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { createBucket, createGroup, createPlan } from '@seta/planner';
import { plannerListBucketsTool } from '@seta/planner/agent-tools';
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

describe('planner_listBuckets tool', () => {
  it('declares the bucket.read permission', () => {
    expect(requiredPermissionFor(plannerListBucketsTool)).toBe('planner.bucket.read');
  });

  it('returns buckets in a plan', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });
      const group = await createGroup({ tenant_id, name: 'Engineering', session });
      const plan = await createPlan({ group_id: group.id, name: 'Q3 Roadmap', session });
      await createBucket({ plan_id: plan.id, name: 'Backlog', session });
      await createBucket({ plan_id: plan.id, name: 'In Progress', session });

      const result = (await plannerListBucketsTool.execute!(
        { planId: plan.id },
        makeToolContext({ user_id: admin_user_id, tenant_id }),
      )) as { buckets: { id: string; name: string; planId: string }[] };

      const names = result.buckets.map((b) => b.name).sort();
      expect(names).toEqual(['Backlog', 'In Progress']);
      expect(result.buckets.every((b) => b.planId === plan.id)).toBe(true);
    });
  });

  it('throws NOT_FOUND for an unknown plan', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      await expect(
        plannerListBucketsTool.execute!(
          { planId: crypto.randomUUID() },
          makeToolContext({ user_id: admin_user_id, tenant_id }),
        ),
      ).rejects.toThrow();
    });
  });
});
