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
  listMyTasks,
  updateTask,
} from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const dbCfg = () => ({
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
});

describe('listMyTasks', () => {
  it('returns empty section arrays when the user has no assignments', async () => {
    await withTestDb(dbCfg(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const result = await listMyTasks({}, seeded.adminSession);
        expect(result.late).toHaveLength(0);
        expect(result.dueThisWeek).toHaveLength(0);
        expect(result.inProgress).toHaveLength(0);
        expect(result.notStarted).toHaveLength(0);
        expect(result.recentlyCompleted).toHaveLength(0);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('buckets tasks into late / dueThisWeek / inProgress / notStarted by due_at and percent_complete', async () => {
    await withTestDb(dbCfg(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });

        const now = Date.now();
        const past = new Date(now - 3 * 86_400_000).toISOString();
        const soon = new Date(now + 3 * 86_400_000).toISOString();

        const t1 = await createTask({ plan_id: plan.id, title: 'Late', session });
        await updateTask({
          task_id: t1.id,
          expected_version: t1.version,
          patch: { due_at: past, percent_complete: 50 },
          session,
        });
        await assignTask({ task_id: t1.id, user_id: session.user_id, session });

        const t2 = await createTask({ plan_id: plan.id, title: 'Soon', session });
        await updateTask({
          task_id: t2.id,
          expected_version: t2.version,
          patch: { due_at: soon, percent_complete: 0 },
          session,
        });
        await assignTask({ task_id: t2.id, user_id: session.user_id, session });

        const t3 = await createTask({ plan_id: plan.id, title: 'In progress', session });
        await updateTask({
          task_id: t3.id,
          expected_version: t3.version,
          patch: { percent_complete: 50 },
          session,
        });
        await assignTask({ task_id: t3.id, user_id: session.user_id, session });

        const t4 = await createTask({ plan_id: plan.id, title: 'Not started', session });
        await assignTask({ task_id: t4.id, user_id: session.user_id, session });

        const r = await listMyTasks({}, session);
        expect(r.late.map((x) => x.id)).toEqual([t1.id]);
        expect(r.dueThisWeek.map((x) => x.id)).toEqual([t2.id]);
        expect(r.inProgress.map((x) => x.id)).toEqual([t3.id]);
        expect(r.notStarted.map((x) => x.id)).toEqual([t4.id]);
        expect(r.recentlyCompleted).toHaveLength(0);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('completed tasks land in recentlyCompleted; deferred tasks appear in no section', async () => {
    await withTestDb(dbCfg(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });

        const done = await createTask({ plan_id: plan.id, title: 'Done', session });
        await assignTask({ task_id: done.id, user_id: session.user_id, session });
        await completeTask({ task_id: done.id, expected_version: done.version, session });

        const deferred = await createTask({ plan_id: plan.id, title: 'Deferred', session });
        await updateTask({
          task_id: deferred.id,
          expected_version: deferred.version,
          patch: { is_deferred: true },
          session,
        });
        await assignTask({ task_id: deferred.id, user_id: session.user_id, session });

        const r = await listMyTasks({}, session);
        expect(r.recentlyCompleted.map((x) => x.id)).toEqual([done.id]);
        expect(r.late).toHaveLength(0);
        expect(r.dueThisWeek).toHaveLength(0);
        expect(r.inProgress).toHaveLength(0);
        expect(r.notStarted).toHaveLength(0);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('filter.plan_id restricts every section to that plan', async () => {
    await withTestDb(dbCfg(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const planA = await createPlan({ group_id: group.id, name: 'A', session });
        const planB = await createPlan({ group_id: group.id, name: 'B', session });

        const a = await createTask({ plan_id: planA.id, title: 'A1', session });
        await assignTask({ task_id: a.id, user_id: session.user_id, session });
        const b = await createTask({ plan_id: planB.id, title: 'B1', session });
        await assignTask({ task_id: b.id, user_id: session.user_id, session });

        const rA = await listMyTasks({ filter: { plan_id: planA.id } }, session);
        expect(rA.notStarted.map((t) => t.id)).toEqual([a.id]);
        const rB = await listMyTasks({ filter: { plan_id: planB.id } }, session);
        expect(rB.notStarted.map((t) => t.id)).toEqual([b.id]);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('filter.priority restricts every section to tasks with that priority_number', async () => {
    await withTestDb(dbCfg(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });

        const urgent = await createTask({ plan_id: plan.id, title: 'Urgent', session });
        await updateTask({
          task_id: urgent.id,
          expected_version: urgent.version,
          patch: { priority_number: 1 },
          session,
        });
        await assignTask({ task_id: urgent.id, user_id: session.user_id, session });

        const low = await createTask({ plan_id: plan.id, title: 'Low', session });
        await updateTask({
          task_id: low.id,
          expected_version: low.version,
          patch: { priority_number: 9 },
          session,
        });
        await assignTask({ task_id: low.id, user_id: session.user_id, session });

        const r = await listMyTasks({ filter: { priority: 'urgent' } }, session);
        expect(r.notStarted.map((t) => t.id)).toEqual([urgent.id]);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('within a section, tasks are sorted by assignee_priority ascending (null last)', async () => {
    await withTestDb(dbCfg(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });

        const a = await createTask({ plan_id: plan.id, title: 'A', session });
        await updateTask({
          task_id: a.id,
          expected_version: a.version,
          patch: { assignee_priority: 'c' },
          session,
        });
        await assignTask({ task_id: a.id, user_id: session.user_id, session });

        const b = await createTask({ plan_id: plan.id, title: 'B', session });
        await updateTask({
          task_id: b.id,
          expected_version: b.version,
          patch: { assignee_priority: 'a' },
          session,
        });
        await assignTask({ task_id: b.id, user_id: session.user_id, session });

        const c = await createTask({ plan_id: plan.id, title: 'C', session });
        await updateTask({
          task_id: c.id,
          expected_version: c.version,
          patch: { assignee_priority: 'b' },
          session,
        });
        await assignTask({ task_id: c.id, user_id: session.user_id, session });

        const r = await listMyTasks({}, session);
        expect(r.notStarted.map((t) => t.id)).toEqual([b.id, c.id, a.id]);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('filter.due="overdue" restricts to tasks with due_at < now', async () => {
    await withTestDb(dbCfg(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });

        const past = new Date(Date.now() - 3 * 86_400_000).toISOString();
        const future = new Date(Date.now() + 10 * 86_400_000).toISOString();

        const overdueT = await createTask({ plan_id: plan.id, title: 'Overdue', session });
        await updateTask({
          task_id: overdueT.id,
          expected_version: overdueT.version,
          patch: { due_at: past },
          session,
        });
        await assignTask({ task_id: overdueT.id, user_id: session.user_id, session });

        const futureT = await createTask({ plan_id: plan.id, title: 'Future', session });
        await updateTask({
          task_id: futureT.id,
          expected_version: futureT.version,
          patch: { due_at: future },
          session,
        });
        await assignTask({ task_id: futureT.id, user_id: session.user_id, session });

        const r = await listMyTasks({ filter: { due: 'overdue' } }, session);
        const allIds = [
          ...r.late,
          ...r.dueThisWeek,
          ...r.inProgress,
          ...r.notStarted,
          ...r.recentlyCompleted,
        ].map((t) => t.id);
        expect(allIds).toContain(overdueT.id);
        expect(allIds).not.toContain(futureT.id);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
