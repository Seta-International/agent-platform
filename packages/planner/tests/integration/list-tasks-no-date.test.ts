import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createGroup, createPlan, createTask, listTasks } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

function testDbOpts() {
  return {
    templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
    baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
  };
}

describe('listTasks no_date filter', () => {
  it('returns only tasks with neither start_at nor due_at', async () => {
    await withTestDb(testDbOpts(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });

        const undated = await createTask({ plan_id: plan.id, title: 'undated', session });
        await createTask({
          plan_id: plan.id,
          title: 'has-due',
          due_at: '2026-06-10T00:00:00Z',
          session,
        });
        await createTask({
          plan_id: plan.id,
          title: 'has-start',
          start_at: '2026-06-10T00:00:00Z',
          session,
        });

        const result = await listTasks({
          filters: { plan_id: plan.id, no_date: true },
          session,
        });
        expect(result.tasks.map((t) => t.id)).toEqual([undated.id]);

        // Filter absent → all three come back.
        const all = await listTasks({ filters: { plan_id: plan.id }, session });
        expect(all.tasks).toHaveLength(3);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
