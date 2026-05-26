import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  addChecklistItem,
  addGroupMember,
  createBucket,
  createGroup,
  createLabel,
  createPlan,
  createTask,
  getGroup,
  getPlan,
  listBuckets,
  listChecklistItems,
  listGroupMembers,
  listGroups,
  listLabels,
  listPlans,
} from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

// ---------------------------------------------------------------------------
// listGroups
// ---------------------------------------------------------------------------

describe('listGroups', () => {
  it('tenant-admin sees all groups in tenant', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          await createGroup({ tenant_id: seeded.tenant_id, name: 'Alpha', session });
          await createGroup({ tenant_id: seeded.tenant_id, name: 'Beta', session });

          const groups = await listGroups({ session });
          expect(groups.length).toBeGreaterThanOrEqual(2);
          const names = groups.map((g) => g.name);
          expect(names).toContain('Alpha');
          expect(names).toContain('Beta');
          // Ordered by name ascending
          const alphaIdx = names.indexOf('Alpha');
          const betaIdx = names.indexOf('Beta');
          expect(alphaIdx).toBeLessThan(betaIdx);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('group-scoped viewer sees only their accessible groups', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const adminSession = seeded.adminSession;

          const groupA = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Alpha',
            session: adminSession,
          });
          await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Beta',
            session: adminSession,
          });

          const viewerSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: seeded.admin.user_id,
            roles: ['planner.viewer'],
            accessible_group_ids: [groupA.id],
          });

          const groups = await listGroups({ session: viewerSession });
          expect(groups).toHaveLength(1);
          expect(groups[0]?.id).toBe(groupA.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws FORBIDDEN when session has no planner.group.read', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const noPermSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: crypto.randomUUID(),
            roles: [],
          });

          await expect(listGroups({ session: noPermSession })).rejects.toMatchObject({
            code: 'FORBIDDEN',
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('viewer with no accessible groups sees empty list', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const adminSession = seeded.adminSession;
          await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Alpha',
            session: adminSession,
          });

          const viewerSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: seeded.admin.user_id,
            roles: ['planner.viewer'],
            accessible_group_ids: [],
          });

          const groups = await listGroups({ session: viewerSession });
          expect(groups).toHaveLength(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// getGroup
// ---------------------------------------------------------------------------

describe('getGroup', () => {
  it('tenant-admin gets an existing group', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Engineering',
            session,
          });

          const fetched = await getGroup({ group_id: group.id, session });
          expect(fetched.id).toBe(group.id);
          expect(fetched.name).toBe('Engineering');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws NOT_FOUND for unknown group_id', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          await expect(
            getGroup({ group_id: crypto.randomUUID(), session: seeded.adminSession }),
          ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('group-scoped viewer is FORBIDDEN for group outside their accessible list', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const adminSession = seeded.adminSession;
          const groupA = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Alpha',
            session: adminSession,
          });
          const groupB = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Beta',
            session: adminSession,
          });

          const viewerSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: seeded.admin.user_id,
            roles: ['planner.viewer'],
            accessible_group_ids: [groupA.id],
          });

          // groupB is outside viewerSession's accessible_group_ids
          await expect(
            getGroup({ group_id: groupB.id, session: viewerSession }),
          ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// listGroupMembers
// ---------------------------------------------------------------------------

describe('listGroupMembers', () => {
  it('returns members with display_name and email from projection', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Alice', email: 'alice@example.test' }],
          });
          const session = seeded.adminSession;
          const [alice] = seeded.users;
          if (!alice) throw new Error('Seed did not create Alice');

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Engineering',
            session,
          });
          await addGroupMember({ group_id: group.id, user_id: alice.user_id, session });

          const { members, total } = await listGroupMembers({ group_id: group.id, session });
          expect(members).toHaveLength(2);
          expect(total).toBe(2);
          const aliceMember = members.find((m) => m.user_id === alice.user_id);
          expect(aliceMember?.display_name).toBe('Alice');
          expect(aliceMember?.email).toBe('alice@example.test');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws FORBIDDEN when viewer lacks planner.group.member.read', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const adminSession = seeded.adminSession;
          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session: adminSession,
          });

          const noPermSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: crypto.randomUUID(),
            roles: [],
          });

          await expect(
            listGroupMembers({ group_id: group.id, session: noPermSession }),
          ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// listPlans
// ---------------------------------------------------------------------------

describe('listPlans', () => {
  it('tenant-admin sees all plans in tenant', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session,
          });
          await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          await createPlan({ group_id: group.id, name: 'Sprint 2', session });

          const plans = await listPlans({ session });
          expect(plans.length).toBeGreaterThanOrEqual(2);
          const names = plans.map((p) => p.name);
          expect(names).toContain('Sprint 1');
          expect(names).toContain('Sprint 2');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('group-scoped viewer sees only plans in their accessible groups', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const adminSession = seeded.adminSession;

          const groupA = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Alpha',
            session: adminSession,
          });
          const groupB = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Beta',
            session: adminSession,
          });
          const planA = await createPlan({
            group_id: groupA.id,
            name: 'Plan A',
            session: adminSession,
          });
          await createPlan({ group_id: groupB.id, name: 'Plan B', session: adminSession });

          const viewerSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: seeded.admin.user_id,
            roles: ['planner.viewer'],
            accessible_group_ids: [groupA.id],
          });

          const plans = await listPlans({ session: viewerSession });
          expect(plans).toHaveLength(1);
          expect(plans[0]?.id).toBe(planA.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws FORBIDDEN when session has no planner.plan.read', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const noPermSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: crypto.randomUUID(),
            roles: [],
          });

          await expect(listPlans({ session: noPermSession })).rejects.toMatchObject({
            code: 'FORBIDDEN',
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// getPlan
// ---------------------------------------------------------------------------

describe('getPlan', () => {
  it('tenant-admin gets an existing plan', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session,
          });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });

          const fetched = await getPlan({ plan_id: plan.id, session });
          expect(fetched.id).toBe(plan.id);
          expect(fetched.name).toBe('Sprint 1');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws NOT_FOUND for unknown plan_id', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          await expect(
            getPlan({ plan_id: crypto.randomUUID(), session: seeded.adminSession }),
          ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('group-scoped viewer is FORBIDDEN for plan outside their accessible groups', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const adminSession = seeded.adminSession;
          const groupA = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Alpha',
            session: adminSession,
          });
          const groupB = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Beta',
            session: adminSession,
          });
          const planInB = await createPlan({
            group_id: groupB.id,
            name: 'Plan B',
            session: adminSession,
          });

          const viewerSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: seeded.admin.user_id,
            roles: ['planner.viewer'],
            accessible_group_ids: [groupA.id],
          });

          await expect(
            getPlan({ plan_id: planInB.id, session: viewerSession }),
          ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// listBuckets
// ---------------------------------------------------------------------------

describe('listBuckets', () => {
  it('returns buckets ordered by order_hint', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session,
          });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          await createBucket({ plan_id: plan.id, name: 'To Do', session });
          await createBucket({ plan_id: plan.id, name: 'In Progress', session });

          const buckets = await listBuckets({ plan_id: plan.id, session });
          expect(buckets).toHaveLength(2);
          // First bucket inserted has a lower order_hint than the second.
          expect(buckets[0]?.order_hint).not.toBeNull();
          expect(buckets[1]?.order_hint).not.toBeNull();
          expect(buckets[0]!.order_hint! < buckets[1]!.order_hint!).toBe(true);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws NOT_FOUND for unknown plan_id', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          await expect(
            listBuckets({ plan_id: crypto.randomUUID(), session: seeded.adminSession }),
          ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('group-scoped viewer is FORBIDDEN for plan outside their accessible groups', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const adminSession = seeded.adminSession;
          const groupA = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Alpha',
            session: adminSession,
          });
          const groupB = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Beta',
            session: adminSession,
          });
          const planInB = await createPlan({
            group_id: groupB.id,
            name: 'Plan B',
            session: adminSession,
          });

          const viewerSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: seeded.admin.user_id,
            roles: ['planner.viewer'],
            accessible_group_ids: [groupA.id],
          });

          await expect(
            listBuckets({ plan_id: planInB.id, session: viewerSession }),
          ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// listChecklistItems
// ---------------------------------------------------------------------------

describe('listChecklistItems', () => {
  it('returns checklist items ordered by order_hint', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session,
          });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'My Task', session });
          await addChecklistItem({ task_id: task.id, label: 'Step 1', session });
          await addChecklistItem({ task_id: task.id, label: 'Step 2', session });

          const items = await listChecklistItems({ task_id: task.id, session });
          expect(items).toHaveLength(2);
          expect(items[0]?.label).toBe('Step 1');
          expect(items[1]?.label).toBe('Step 2');
          expect(items[0]?.order_hint).not.toBeNull();
          expect(items[1]?.order_hint).not.toBeNull();
          expect(items[0]!.order_hint! < items[1]!.order_hint!).toBe(true);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws NOT_FOUND for unknown task_id', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          await expect(
            listChecklistItems({ task_id: crypto.randomUUID(), session: seeded.adminSession }),
          ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// listLabels
// ---------------------------------------------------------------------------

describe('listLabels', () => {
  it('returns labels ordered by name', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session,
          });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          await createLabel({ plan_id: plan.id, name: 'Zebra', color: '#000', session });
          await createLabel({ plan_id: plan.id, name: 'Alpha', color: '#fff', session });

          const labels = await listLabels({ plan_id: plan.id, session });
          expect(labels).toHaveLength(2);
          expect(labels[0]?.name).toBe('Alpha');
          expect(labels[1]?.name).toBe('Zebra');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws NOT_FOUND for unknown plan_id', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          await expect(
            listLabels({ plan_id: crypto.randomUUID(), session: seeded.adminSession }),
          ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('group-scoped viewer is FORBIDDEN for plan outside their accessible groups', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const adminSession = seeded.adminSession;
          const groupA = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Alpha',
            session: adminSession,
          });
          const groupB = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Beta',
            session: adminSession,
          });
          const planInB = await createPlan({
            group_id: groupB.id,
            name: 'Plan B',
            session: adminSession,
          });

          const viewerSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: seeded.admin.user_id,
            roles: ['planner.viewer'],
            accessible_group_ids: [groupA.id],
          });

          await expect(
            listLabels({ plan_id: planInB.id, session: viewerSession }),
          ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
