import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  addChecklistItem,
  addTaskReference,
  applyLabel,
  assignTask,
  completeTask,
  createBucket,
  createGroup,
  createLabel,
  createPlan,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  updateChecklistItem,
} from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

// ---------------------------------------------------------------------------
// listTasks
// ---------------------------------------------------------------------------

describe('listTasks', () => {
  it('empty plan returns []', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });

          const result = await listTasks({ filters: { plan_id: plan.id }, session });
          expect(result.tasks).toHaveLength(0);
          expect(result.next_cursor).toBeUndefined();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns tasks with assignees populated', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
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

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'My Task', session });
          await assignTask({ task_id: task.id, user_id: alice.user_id, session });

          const result = await listTasks({ filters: { plan_id: plan.id }, session });
          expect(result.tasks).toHaveLength(1);
          const t = result.tasks[0]!;
          expect(t.id).toBe(task.id);
          expect(t.assignees).toHaveLength(1);
          expect(t.assignees[0]!.user_id).toBe(alice.user_id);
          expect(t.assignees[0]!.display_name).toBe('Alice');
          expect(t.assignees[0]!.email).toBe('alice@example.test');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('filter by plan_id returns only tasks in that plan', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const planA = await createPlan({ group_id: group.id, name: 'Plan A', session });
          const planB = await createPlan({ group_id: group.id, name: 'Plan B', session });
          const taskA = await createTask({ plan_id: planA.id, title: 'Task A', session });
          await createTask({ plan_id: planB.id, title: 'Task B', session });

          const result = await listTasks({ filters: { plan_id: planA.id }, session });
          expect(result.tasks).toHaveLength(1);
          expect(result.tasks[0]!.id).toBe(taskA.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('filter by bucket_id', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const bucket = await createBucket({ plan_id: plan.id, name: 'To Do', session });
          const taskInBucket = await createTask({
            plan_id: plan.id,
            title: 'Bucketed',
            bucket_id: bucket.id,
            session,
          });
          await createTask({ plan_id: plan.id, title: 'Not Bucketed', session });

          const result = await listTasks({ filters: { bucket_id: bucket.id }, session });
          expect(result.tasks).toHaveLength(1);
          expect(result.tasks[0]!.id).toBe(taskInBucket.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('filter by assignee_id', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [
              { name: 'Alice', email: 'alice@example.test' },
              { name: 'Bob', email: 'bob@example.test' },
            ],
          });
          const session = seeded.adminSession;
          const [alice, bob] = seeded.users;
          if (!alice || !bob) throw new Error('Seed did not create users');

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const taskAlice = await createTask({ plan_id: plan.id, title: 'Task Alice', session });
          const taskBob = await createTask({ plan_id: plan.id, title: 'Task Bob', session });
          await assignTask({ task_id: taskAlice.id, user_id: alice.user_id, session });
          await assignTask({ task_id: taskBob.id, user_id: bob.user_id, session });

          const result = await listTasks({ filters: { assignee_id: alice.user_id }, session });
          expect(result.tasks).toHaveLength(1);
          expect(result.tasks[0]!.id).toBe(taskAlice.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('filter by skill_tags (GIN overlap)', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const taskTs = await createTask({
            plan_id: plan.id,
            title: 'TypeScript Task',
            skill_tags: ['typescript', 'react'],
            session,
          });
          await createTask({
            plan_id: plan.id,
            title: 'Python Task',
            skill_tags: ['python'],
            session,
          });

          const result = await listTasks({
            filters: { skill_tags: ['typescript'] },
            session,
          });
          expect(result.tasks).toHaveLength(1);
          expect(result.tasks[0]!.id).toBe(taskTs.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('filter by percent_complete_gte', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const completedTask = await createTask({
            plan_id: plan.id,
            title: 'Completed Task',
            session,
          });
          await createTask({ plan_id: plan.id, title: 'Not Started', session });

          // Use completeTask to set progress to 'completed'.
          await completeTask({
            task_id: completedTask.id,
            expected_version: completedTask.version,
            session,
          });

          const result = await listTasks({
            filters: { percent_complete_gte: 100 },
            session,
          });
          const ids = result.tasks.map((t) => t.id);
          expect(ids).toContain(completedTask.id);
          expect(result.tasks.every((t) => t.percent_complete === 100)).toBe(true);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('filter by due_before', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const earlyTask = await createTask({
            plan_id: plan.id,
            title: 'Early Task',
            due_at: '2024-01-01T00:00:00.000Z',
            session,
          });
          await createTask({
            plan_id: plan.id,
            title: 'Late Task',
            due_at: '2030-01-01T00:00:00.000Z',
            session,
          });

          const result = await listTasks({
            filters: { due_before: '2025-01-01T00:00:00.000Z' },
            session,
          });
          const ids = result.tasks.map((t) => t.id);
          expect(ids).toContain(earlyTask.id);
          expect(ids).not.toContain('late');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('include_deleted toggles visibility of soft-deleted tasks', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'Deleted Task', session });

          await deleteTask({ task_id: task.id, expected_version: task.version, session });

          const withoutDeleted = await listTasks({ filters: { plan_id: plan.id }, session });
          expect(withoutDeleted.tasks.map((t) => t.id)).not.toContain(task.id);

          const withDeleted = await listTasks({
            filters: { plan_id: plan.id, include_deleted: true },
            session,
          });
          expect(withDeleted.tasks.map((t) => t.id)).toContain(task.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('pagination: limit=10 returns cursor, second page works', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });

          // Create 25 tasks
          for (let i = 0; i < 25; i++) {
            await createTask({ plan_id: plan.id, title: `Task ${i + 1}`, session });
          }

          const page1 = await listTasks({ filters: { plan_id: plan.id }, limit: 10, session });
          expect(page1.tasks).toHaveLength(10);
          expect(page1.next_cursor).toBeDefined();

          const page2 = await listTasks({
            filters: { plan_id: plan.id },
            limit: 10,
            cursor: page1.next_cursor,
            session,
          });
          expect(page2.tasks).toHaveLength(10);

          // No overlap between pages
          const page1Ids = new Set(page1.tasks.map((t) => t.id));
          for (const t of page2.tasks) {
            expect(page1Ids.has(t.id)).toBe(false);
          }

          const page3 = await listTasks({
            filters: { plan_id: plan.id },
            limit: 10,
            cursor: page2.next_cursor,
            session,
          });
          expect(page3.tasks).toHaveLength(5);
          expect(page3.next_cursor).toBeUndefined();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('group-scope filter: viewer only sees tasks from accessible groups', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
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
          const planB = await createPlan({
            group_id: groupB.id,
            name: 'Plan B',
            session: adminSession,
          });
          const taskA = await createTask({
            plan_id: planA.id,
            title: 'Task in A',
            session: adminSession,
          });
          await createTask({ plan_id: planB.id, title: 'Task in B', session: adminSession });

          const viewerSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: seeded.admin.user_id,
            roles: ['planner.viewer'],
            accessible_group_ids: [groupA.id],
          });

          const result = await listTasks({ session: viewerSession });
          expect(result.tasks).toHaveLength(1);
          expect(result.tasks[0]!.id).toBe(taskA.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// getTask
// ---------------------------------------------------------------------------

describe('getTask', () => {
  it('happy path: all fields populated (assignees, labels, checklist_summary)', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
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

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const label = await createLabel({
            plan_id: plan.id,
            name: 'Bug',
            color: '#f00',
            session,
          });
          const task = await createTask({ plan_id: plan.id, title: 'Feature Task', session });

          await assignTask({ task_id: task.id, user_id: alice.user_id, session });
          await applyLabel({ task_id: task.id, label_id: label.id, session });
          const item1 = await addChecklistItem({ task_id: task.id, label: 'Step 1', session });
          await addChecklistItem({ task_id: task.id, label: 'Step 2', session });
          await updateChecklistItem({ item_id: item1.id, patch: { checked: true }, session });
          await addTaskReference({
            task_id: task.id,
            url: 'https://example.com/spec',
            alias: 'Spec',
            type: 'web',
            session,
          });
          await addTaskReference({
            task_id: task.id,
            url: 'https://example.com/doc',
            type: 'word',
            session,
          });

          const fetched = await getTask({ task_id: task.id, session });
          expect(fetched.id).toBe(task.id);
          expect(fetched.title).toBe('Feature Task');
          expect(fetched.assignees).toHaveLength(1);
          expect(fetched.assignees[0]!.user_id).toBe(alice.user_id);
          expect(fetched.labels).toHaveLength(1);
          expect(fetched.labels[0]!.id).toBe(label.id);
          expect(fetched.checklist_summary.total).toBe(2);
          expect(fetched.checklist_summary.checked).toBe(1);
          expect(fetched.checklist).toHaveLength(2);
          expect(fetched.checklist.map((c) => c.label).sort()).toEqual(['Step 1', 'Step 2']);
          expect(fetched.checklist.find((c) => c.label === 'Step 1')?.checked).toBe(true);
          expect(fetched.references).toHaveLength(2);
          expect(fetched.references.map((r) => r.url).sort()).toEqual([
            'https://example.com/doc',
            'https://example.com/spec',
          ]);
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
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          await expect(
            getTask({ task_id: crypto.randomUUID(), session: seeded.adminSession }),
          ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws FORBIDDEN when group is outside session reach', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
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
          const planB = await createPlan({
            group_id: groupB.id,
            name: 'Plan B',
            session: adminSession,
          });
          const taskInB = await createTask({
            plan_id: planB.id,
            title: 'Task in B',
            session: adminSession,
          });

          const viewerSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: seeded.admin.user_id,
            roles: ['planner.viewer'],
            accessible_group_ids: [groupA.id],
          });

          await expect(
            getTask({ task_id: taskInB.id, session: viewerSession }),
          ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
