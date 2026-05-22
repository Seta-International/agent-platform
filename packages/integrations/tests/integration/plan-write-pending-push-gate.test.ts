import { resetCoreDb } from '@seta/core/internal/test-support';
import type { PlannerSessionScope } from '@seta/planner';
import {
  applyLabel,
  assignTask,
  completeTask,
  createBucket,
  createGroup,
  createLabel,
  createPlan,
  createTask,
  deletePlan,
  linkGroupToM365,
  linkPlanToM365,
  reopenTask,
  setCategoryDescriptions,
  unassignTask,
  updateBucket,
  updatePlan,
} from '@seta/planner';
import { describe, expect, it } from 'vitest';
import { withIntegrationsTestDb } from '../helpers/test-db.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SeededTenant {
  tenant_id: string;
  admin_user_id: string;
  adminSession: import('@seta/core').SessionScope;
  /** System actor session: same roles as adminSession + M365 actor tag — mirrors how planner domain tests simulate system writes. */
  systemSession: PlannerSessionScope;
}

async function seedTenantWithLinkedPlan(pool: import('pg').Pool): Promise<{
  tenant: SeededTenant;
  group_id: string;
  plan_id: string;
}> {
  const { hashRoleSummary } = await import('@seta/core');
  const { createUser } = await import('@seta/identity');

  const tenantId = crypto.randomUUID();
  const tenantSlug = `test-${tenantId.slice(0, 8)}`;
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
    tenantId,
    `Test Org ${tenantId.slice(0, 8)}`,
    tenantSlug,
  ]);

  const adminEmail = `admin-${tenantId.slice(0, 8)}@example.test`;
  const adminResult = await createUser(
    {
      tenant_id: tenantId,
      email: adminEmail,
      name: 'Test Admin',
      password: 'correct-horse-battery-staple',
      initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
    },
    { type: 'cli', user_id: null },
  );

  await pool.query(
    `INSERT INTO planner.assignee_projection
       (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
       VALUES ($1, $2, $3, $4, ARRAY[]::text[], 'available', 'UTC')
       ON CONFLICT (user_id) DO NOTHING`,
    [adminResult.user_id, tenantId, 'Test Admin', adminEmail],
  );

  const role_summary = { roles: ['org.admin' as const], cross_tenant_read: false };
  const adminSession: import('@seta/core').SessionScope = {
    session_id: crypto.randomUUID(),
    user_id: adminResult.user_id,
    tenant_id: tenantId,
    email: adminEmail,
    display_name: 'Test Admin',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    accessible_group_ids: [],
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };

  // System session: same org.admin roles as the admin session + M365 actor tag.
  // This mirrors the pattern used in planner domain tests for system-actor writes.
  const systemSession: PlannerSessionScope = {
    ...adminSession,
    actor: { kind: 'system', system_id: 'integrations.m365' },
  };

  const tenant: SeededTenant = {
    tenant_id: tenantId,
    admin_user_id: adminResult.user_id,
    adminSession,
    systemSession,
  };

  // Create group → link to M365 → create plan → link to M365
  const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session: adminSession });
  await linkGroupToM365({ group_id: group.id, external_id: 'G-EXT-1', session: adminSession });
  const plan = await createPlan({ group_id: group.id, name: 'Roadmap', session: adminSession });
  await linkPlanToM365({ plan_id: plan.id, external_id: 'P-EXT-1', session: adminSession });

  return { tenant, group_id: group.id, plan_id: plan.id };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LINKED_PLAN_IMMUTABLE_PENDING_PUSH write gate', () => {
  it('human session updatePlan on m365-linked plan throws LINKED_PLAN_IMMUTABLE_PENDING_PUSH', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      resetCoreDb();
      try {
        const { tenant, plan_id } = await seedTenantWithLinkedPlan(pool);

        const linkedPlan = await import('@seta/planner').then((m) =>
          m.getPlan({ plan_id, session: tenant.adminSession }),
        );
        expect(linkedPlan.external_source).toBe('m365');

        await expect(
          updatePlan({
            plan_id,
            expected_version: linkedPlan.version,
            patch: { name: 'New Title' },
            session: tenant.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'LINKED_PLAN_IMMUTABLE_PENDING_PUSH' });
      } finally {
        resetCoreDb();
      }
    });
  });

  it('system session updatePlan on m365-linked plan succeeds', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      resetCoreDb();
      try {
        const { tenant, plan_id } = await seedTenantWithLinkedPlan(pool);
        const { systemSession } = tenant;

        const linkedPlan = await import('@seta/planner').then((m) =>
          m.getPlan({ plan_id, session: systemSession }),
        );

        const updated = await updatePlan({
          plan_id,
          expected_version: linkedPlan.version,
          patch: { name: 'System Updated' },
          session: systemSession,
        });

        expect(updated.name).toBe('System Updated');
        expect(updated.external_source).toBe('m365');
      } finally {
        resetCoreDb();
      }
    });
  });

  it('human session createTask on m365-linked plan throws LINKED_PLAN_IMMUTABLE_PENDING_PUSH', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      resetCoreDb();
      try {
        const { tenant, plan_id } = await seedTenantWithLinkedPlan(pool);

        await expect(
          createTask({ plan_id, title: 'New Task', session: tenant.adminSession }),
        ).rejects.toMatchObject({ code: 'LINKED_PLAN_IMMUTABLE_PENDING_PUSH' });
      } finally {
        resetCoreDb();
      }
    });
  });

  it('human session updateBucket on m365-linked plan throws LINKED_PLAN_IMMUTABLE_PENDING_PUSH', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      resetCoreDb();
      try {
        const { tenant, plan_id } = await seedTenantWithLinkedPlan(pool);
        const { systemSession } = tenant;

        // System actor creates the bucket (bypasses gate)
        const bucket = await createBucket({ plan_id, name: 'Sprint 1', session: systemSession });

        await expect(
          updateBucket({
            bucket_id: bucket.id,
            expected_version: bucket.version,
            patch: { name: 'Renamed' },
            session: tenant.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'LINKED_PLAN_IMMUTABLE_PENDING_PUSH' });
      } finally {
        resetCoreDb();
      }
    });
  });

  it('human session applyLabel on m365-linked plan throws LINKED_PLAN_IMMUTABLE_PENDING_PUSH', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      resetCoreDb();
      try {
        const { tenant, plan_id } = await seedTenantWithLinkedPlan(pool);
        const { systemSession } = tenant;

        // System actor creates the label and task (bypasses gate)
        const label = await createLabel({
          plan_id,
          name: 'Bug',
          color: '#ff0000',
          session: systemSession,
        });
        const task = await createTask({ plan_id, title: 'T1', session: systemSession });

        await expect(
          applyLabel({ task_id: task.id, label_id: label.id, session: tenant.adminSession }),
        ).rejects.toMatchObject({ code: 'LINKED_PLAN_IMMUTABLE_PENDING_PUSH' });
      } finally {
        resetCoreDb();
      }
    });
  });

  it('human session setCategoryDescriptions on m365-linked plan throws LINKED_PLAN_IMMUTABLE_PENDING_PUSH', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      resetCoreDb();
      try {
        const { tenant, plan_id } = await seedTenantWithLinkedPlan(pool);

        await expect(
          setCategoryDescriptions({
            plan_id,
            slots: { 1: { name: 'Urgent' } },
            session: tenant.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'LINKED_PLAN_IMMUTABLE_PENDING_PUSH' });
      } finally {
        resetCoreDb();
      }
    });
  });

  it('human session completeTask / reopenTask / assignTask / unassignTask / createLabel / deletePlan on m365-linked plan throw LINKED_PLAN_IMMUTABLE_PENDING_PUSH', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      resetCoreDb();
      try {
        const { tenant, plan_id } = await seedTenantWithLinkedPlan(pool);
        const { adminSession, systemSession } = tenant;

        // System actor creates the task (bypasses gate)
        const task = await createTask({ plan_id, title: 'Linked Task', session: systemSession });

        await expect(
          completeTask({ task_id: task.id, expected_version: task.version, session: adminSession }),
        ).rejects.toMatchObject({ code: 'LINKED_PLAN_IMMUTABLE_PENDING_PUSH' });

        await expect(
          reopenTask({ task_id: task.id, expected_version: task.version, session: adminSession }),
        ).rejects.toMatchObject({ code: 'LINKED_PLAN_IMMUTABLE_PENDING_PUSH' });

        await expect(
          assignTask({ task_id: task.id, user_id: adminSession.user_id, session: adminSession }),
        ).rejects.toMatchObject({ code: 'LINKED_PLAN_IMMUTABLE_PENDING_PUSH' });

        await expect(
          unassignTask({ task_id: task.id, user_id: adminSession.user_id, session: adminSession }),
        ).rejects.toMatchObject({ code: 'LINKED_PLAN_IMMUTABLE_PENDING_PUSH' });

        await expect(
          createLabel({ plan_id, name: 'Blocker', color: '#ff0000', session: adminSession }),
        ).rejects.toMatchObject({ code: 'LINKED_PLAN_IMMUTABLE_PENDING_PUSH' });

        const linkedPlan = await import('@seta/planner').then((m) =>
          m.getPlan({ plan_id, session: adminSession }),
        );
        await expect(
          deletePlan({ plan_id, expected_version: linkedPlan.version, session: adminSession }),
        ).rejects.toMatchObject({ code: 'LINKED_PLAN_IMMUTABLE_PENDING_PUSH' });
      } finally {
        resetCoreDb();
      }
    });
  });

  it('human session updatePlan on a native plan succeeds (gate does not fire)', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      resetCoreDb();
      try {
        const { hashRoleSummary } = await import('@seta/core');
        const { createUser } = await import('@seta/identity');

        const tenantId = crypto.randomUUID();
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          tenantId,
          `Native Org ${tenantId.slice(0, 8)}`,
          `native-${tenantId.slice(0, 8)}`,
        ]);

        const adminEmail = `admin-native-${tenantId.slice(0, 8)}@example.test`;
        const adminResult = await createUser(
          {
            tenant_id: tenantId,
            email: adminEmail,
            name: 'Test Admin',
            password: 'correct-horse-battery-staple',
            initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
          },
          { type: 'cli', user_id: null },
        );
        const role_summary = { roles: ['org.admin' as const], cross_tenant_read: false };
        const adminSession: import('@seta/core').SessionScope = {
          session_id: crypto.randomUUID(),
          user_id: adminResult.user_id,
          tenant_id: tenantId,
          email: adminEmail,
          display_name: 'Test Admin',
          role_summary,
          role_summary_hash: hashRoleSummary(role_summary),
          accessible_group_ids: [],
          cross_tenant_read: false,
          built_at: new Date(),
          invalidated_at: null,
        };

        const group = await createGroup({
          tenant_id: tenantId,
          name: 'Eng',
          session: adminSession,
        });
        const plan = await createPlan({
          group_id: group.id,
          name: 'Native Plan',
          session: adminSession,
        });

        // Native plan — human session should succeed
        const updated = await updatePlan({
          plan_id: plan.id,
          expected_version: plan.version,
          patch: { name: 'Updated Native' },
          session: adminSession,
        });

        expect(updated.name).toBe('Updated Native');
        expect(updated.external_source).toBe('native');
      } finally {
        resetCoreDb();
      }
    });
  });
});
