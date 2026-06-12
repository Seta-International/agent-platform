import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { plannerDb } from '../../../src/backend/db/index.ts';
import { tasks } from '../../../src/backend/db/schema.ts';
import {
  createBucket,
  createGroup,
  createPlan,
  createTask,
  getPlanChartData,
} from '../../../src/index.ts';
import { seedTenant } from '../../helpers.ts';

const dbEnv = () => ({
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
});

const DAY = 24 * 60 * 60 * 1000;

async function setState(
  taskId: string,
  s: {
    percent?: 0 | 50 | 100;
    deferred?: boolean;
    due?: Date | null;
    priority?: number;
    bucketId?: string;
  },
) {
  await plannerDb()
    .update(tasks)
    .set({
      percent_complete: s.percent ?? 0,
      is_deferred: s.deferred ?? false,
      due_at: s.due ?? null,
      priority_number: s.priority ?? 5,
      ...(s.bucketId ? { bucket_id: s.bucketId } : {}),
    })
    .where(eq(tasks.id, taskId));
}

describe('getPlanChartData — byStatus', () => {
  it('carves out late and deferred; segments are mutually exclusive and sum to total', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool, { users: [] });
        const admin = seeded.adminSession;
        const group = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'Test Group',
          session: admin,
        });
        const plan = await createPlan({ group_id: group.id, name: 'P', session: admin });

        const mk = async (state: Parameters<typeof setState>[1]) => {
          const t = await createTask({ plan_id: plan.id, title: 't', session: admin });
          await setState(t.id, state);
          return t.id;
        };

        const past = new Date(Date.now() - DAY);
        const future = new Date(Date.now() + 7 * DAY);

        await mk({ percent: 0, due: future });
        await mk({ percent: 0, due: null });
        await mk({ percent: 50, due: future });
        await mk({ percent: 100 });
        await mk({ percent: 50, due: past });
        await mk({ percent: 0, due: past });
        await mk({ percent: 50, deferred: true });

        const data = await getPlanChartData({ plan_id: plan.id }, admin);

        expect(data.byStatus).toEqual({
          not_started: 2,
          in_progress: 1,
          completed: 1,
          late: 2,
          deferred: 1,
        });
        const total =
          data.byStatus.not_started +
          data.byStatus.in_progress +
          data.byStatus.completed +
          data.byStatus.late +
          data.byStatus.deferred;
        expect(total).toBe(7);
        expect(data.kpis.open).toBe(6);
        expect(data.kpis.completed).toBe(1);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});

describe('getPlanChartData — composition', () => {
  it('breaks bucket/priority/member counts down by status and maps priority ranges', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool, { users: [] });
        const admin = seeded.adminSession;
        const group = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'Test Group 2',
          session: admin,
        });
        const plan = await createPlan({ group_id: group.id, name: 'P', session: admin });
        const todo = await createBucket({ plan_id: plan.id, name: 'Todo', session: admin });
        const done = await createBucket({ plan_id: plan.id, name: 'Done', session: admin });
        await createBucket({ plan_id: plan.id, name: 'Empty', session: admin });

        const mk = async (bucketId: string, state: Parameters<typeof setState>[1]) => {
          const t = await createTask({ plan_id: plan.id, title: 't', session: admin });
          await setState(t.id, { ...state, bucketId });
          return t.id;
        };

        await mk(todo.id, { percent: 0, priority: 1 }); // urgent
        await mk(todo.id, { percent: 50, priority: 3 }); // important
        await mk(done.id, { percent: 100, priority: 5 }); // medium
        await mk(done.id, { percent: 100, priority: 9 }); // low

        const data = await getPlanChartData({ plan_id: plan.id }, admin);

        const todoRow = data.byBucket.find((b) => b.name === 'Todo')!;
        expect(todoRow.total).toBe(2);
        expect(todoRow.not_started).toBe(1);
        expect(todoRow.in_progress).toBe(1);
        expect(todoRow.completed).toBe(0);

        const doneRow = data.byBucket.find((b) => b.name === 'Done')!;
        expect(doneRow.total).toBe(2);
        expect(doneRow.completed).toBe(2);

        const emptyRow = data.byBucket.find((b) => b.name === 'Empty')!;
        expect(emptyRow.total).toBe(0);
        expect(emptyRow).toMatchObject({
          not_started: 0,
          in_progress: 0,
          completed: 0,
          late: 0,
          deferred: 0,
        });

        expect(data.byPriority.urgent.not_started).toBe(1);
        expect(data.byPriority.important.in_progress).toBe(1);
        expect(data.byPriority.medium.completed).toBe(1);
        expect(data.byPriority.low.completed).toBe(1);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
