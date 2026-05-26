import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  assignTask,
  completeTask,
  createGroup,
  createPlan,
  createTask,
  listMyAccessibleGroups,
  listMyAssignedTasks,
} from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

// ---------------------------------------------------------------------------
// listMyAccessibleGroups
// ---------------------------------------------------------------------------

describe('listMyAccessibleGroups', () => {
  it('tenant-admin sees all live groups', async () => {
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

          const groups = await listMyAccessibleGroups({ session });
          expect(groups.length).toBeGreaterThanOrEqual(2);
          const names = groups.map((g) => g.name);
          expect(names).toContain('Alpha');
          expect(names).toContain('Beta');
          // Ordered by name
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

  it('group-scoped viewer sees only their accessible_group_ids', async () => {
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

          const groups = await listMyAccessibleGroups({ session: viewerSession });
          expect(groups).toHaveLength(1);
          expect(groups[0]?.id).toBe(groupA.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('viewer with no accessible groups returns empty list', async () => {
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
          await createGroup({ tenant_id: seeded.tenant_id, name: 'Alpha', session: adminSession });

          const viewerSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: seeded.admin.user_id,
            roles: ['planner.viewer'],
            accessible_group_ids: [],
          });

          const groups = await listMyAccessibleGroups({ session: viewerSession });
          expect(groups).toHaveLength(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws FORBIDDEN when session lacks planner.group.read', async () => {
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
          await expect(listMyAccessibleGroups({ session: noPermSession })).rejects.toMatchObject({
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
// listMyAssignedTasks
// ---------------------------------------------------------------------------

describe('listMyAssignedTasks', () => {
  it('returns only tasks where calling user is in task_assignments', async () => {
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
          const adminSession = seeded.adminSession;
          const [alice] = seeded.users;
          if (!alice) throw new Error('Seed did not create Alice');

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session: adminSession,
          });
          const plan = await createPlan({
            group_id: group.id,
            name: 'Sprint 1',
            session: adminSession,
          });
          const myTask = await createTask({
            plan_id: plan.id,
            title: 'My Task',
            session: adminSession,
          });
          await createTask({ plan_id: plan.id, title: 'Someone Else Task', session: adminSession });
          await assignTask({ task_id: myTask.id, user_id: alice.user_id, session: adminSession });

          const aliceSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: alice.user_id,
            roles: ['org.admin'],
            accessible_group_ids: [],
          });

          const result = await listMyAssignedTasks({ session: aliceSession });
          expect(result.tasks).toHaveLength(1);
          expect(result.tasks[0]?.id).toBe(myTask.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns empty list when user has no assignments', async () => {
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
          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          await createTask({ plan_id: plan.id, title: 'Unassigned Task', session });

          const result = await listMyAssignedTasks({ session });
          expect(result.tasks).toHaveLength(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('honors percent_complete_gte filter', async () => {
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
          const adminSession = seeded.adminSession;
          const [alice] = seeded.users;
          if (!alice) throw new Error('Seed did not create Alice');

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session: adminSession,
          });
          const plan = await createPlan({
            group_id: group.id,
            name: 'Sprint 1',
            session: adminSession,
          });
          const taskCompleted = await createTask({
            plan_id: plan.id,
            title: 'Completed Task',
            session: adminSession,
          });
          const taskOpen = await createTask({
            plan_id: plan.id,
            title: 'Open Task',
            session: adminSession,
          });
          await assignTask({
            task_id: taskCompleted.id,
            user_id: alice.user_id,
            session: adminSession,
          });
          await assignTask({ task_id: taskOpen.id, user_id: alice.user_id, session: adminSession });
          await completeTask({
            task_id: taskCompleted.id,
            expected_version: taskCompleted.version,
            session: adminSession,
          });

          const aliceSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: alice.user_id,
            roles: ['org.admin'],
            accessible_group_ids: [],
          });

          const result = await listMyAssignedTasks({
            session: aliceSession,
            filters: { percent_complete_gte: 100 },
          });
          expect(result.tasks).toHaveLength(1);
          expect(result.tasks[0]?.id).toBe(taskCompleted.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('applies group-scope filter for viewer session', async () => {
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
          const adminSession = seeded.adminSession;
          const [alice] = seeded.users;
          if (!alice) throw new Error('Seed did not create Alice');

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
          const planB = await createPlan({
            group_id: groupB.id,
            name: 'Plan B',
            session: adminSession,
          });
          const taskInA = await createTask({
            plan_id: planA.id,
            title: 'Task in A',
            session: adminSession,
          });
          const taskInB = await createTask({
            plan_id: planB.id,
            title: 'Task in B',
            session: adminSession,
          });

          // Assign alice to tasks in both groups
          await assignTask({ task_id: taskInA.id, user_id: alice.user_id, session: adminSession });
          await assignTask({ task_id: taskInB.id, user_id: alice.user_id, session: adminSession });

          // Alice has viewer access to groupA only
          const aliceViewerSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: alice.user_id,
            roles: ['planner.viewer'],
            accessible_group_ids: [groupA.id],
          });

          const result = await listMyAssignedTasks({ session: aliceViewerSession });
          // Only taskInA is visible since group-scope restricts to groupA
          expect(result.tasks).toHaveLength(1);
          expect(result.tasks[0]?.id).toBe(taskInA.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
