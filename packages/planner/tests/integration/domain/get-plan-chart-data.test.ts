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
    due?: Date | null;
    priority?: number;
    bucketId?: string;
  },
) {
  await plannerDb()
    .update(tasks)
    .set({
      percent_complete: s.percent ?? 0,
      due_at: s.due ?? null,
      priority_number: s.priority ?? 5,
      ...(s.bucketId ? { bucket_id: s.bucketId } : {}),
    })
    .where(eq(tasks.id, taskId));
}

describe('getPlanChartData — 3-status + filters', () => {
  it('aggregates by percent, computes KPIs, and honours an assignee/status filter', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool, { users: [] });
        const admin = seeded.adminSession;
        const group = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'G',
          session: admin,
        });
        const plan = await createPlan({ group_id: group.id, name: 'P', session: admin });
        const todo = await createBucket({ plan_id: plan.id, name: 'Todo', session: admin });
        const done = await createBucket({ plan_id: plan.id, name: 'Done', session: admin });

        const past = new Date(Date.now() - DAY);
        const mk = async (bucketId: string, s: Parameters<typeof setState>[1]) => {
          const t = await createTask({ plan_id: plan.id, title: 't', session: admin });
          await setState(t.id, { ...s, bucketId });
          return t.id;
        };

        await mk(todo.id, { percent: 0, priority: 1 }); // not_started, urgent
        await mk(todo.id, { percent: 50, priority: 3 }); // in_progress, important
        await mk(done.id, { percent: 100, priority: 5 }); // completed, medium
        await mk(todo.id, { percent: 0, due: past, priority: 9 }); // not_started + LATE, low

        const data = await getPlanChartData({ plan_id: plan.id }, admin);

        expect(data.byStatus).toEqual({ not_started: 2, in_progress: 1, completed: 1 });
        expect(data.kpis.total).toBe(4);
        expect(data.kpis.open).toBe(3);
        expect(data.kpis.late).toBe(1);
        expect(data.kpis.completed).toBe(1);
        expect(data.kpis.in_progress).toBe(1);

        // byPriority is a fixed 4-row array, urgent→low.
        expect(data.byPriority.map((p) => p.key)).toEqual(['urgent', 'important', 'medium', 'low']);
        expect(data.byPriority.find((p) => p.key === 'urgent')?.not_started).toBe(1);
        expect(data.byPriority.find((p) => p.key === 'medium')?.completed).toBe(1);

        // byBucket: empty/active buckets carry the 3-status counts.
        const todoRow = data.byBucket.find((b) => b.name === 'Todo')!;
        expect(todoRow.not_started).toBe(2);
        expect(todoRow.in_progress).toBe(1);
        const doneRow = data.byBucket.find((b) => b.name === 'Done')!;
        expect(doneRow.completed).toBe(1);

        // status filter collapses the dataset.
        const filtered = await getPlanChartData(
          { plan_id: plan.id, filters: { statuses: ['completed'] } },
          admin,
        );
        expect(filtered.byStatus).toEqual({ not_started: 0, in_progress: 0, completed: 1 });
        expect(filtered.kpis.total).toBe(1);

        // bucket filter keeps empty buckets visible with zero counts.
        const byTodo = await getPlanChartData(
          { plan_id: plan.id, filters: { bucket_ids: [todo.id] } },
          admin,
        );
        expect(byTodo.byBucket.find((b) => b.name === 'Done')).toMatchObject({
          not_started: 0,
          in_progress: 0,
          completed: 0,
        });
        expect(byTodo.kpis.total).toBe(3);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
