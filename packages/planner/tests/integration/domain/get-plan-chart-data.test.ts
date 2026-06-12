import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { plannerDb } from '../../../src/backend/db/index.ts';
import { tasks } from '../../../src/backend/db/schema.ts';
import { createGroup, createPlan, createTask, getPlanChartData } from '../../../src/index.ts';
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
