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

describe('listTasks due_before is an ICT day boundary (FUT-800)', () => {
  it('excludes a task due at 02:00 ICT on the boundary day', async () => {
    await withTestDb(testDbOpts(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });

        // 2026-08-02T19:00:00Z is 2026-08-03 02:00 ICT — the day AFTER the week
        // ending 2026-08-02, so dueBefore=2026-08-03 must exclude it.
        const nextWeek = await createTask({
          plan_id: plan.id,
          title: 'due-monday-early',
          due_at: '2026-08-02T19:00:00Z',
          session,
        });
        // 2026-08-02T16:00:00Z is 2026-08-02 23:00 ICT — inside the week.
        const thisWeek = await createTask({
          plan_id: plan.id,
          title: 'due-sunday-late',
          due_at: '2026-08-02T16:00:00Z',
          session,
        });

        const result = await listTasks({
          filters: { plan_id: plan.id, due_before: '2026-08-03' },
          session,
        });

        const ids = result.tasks.map((t) => t.id);
        expect(ids).toContain(thisWeek.id);
        expect(ids).not.toContain(nextWeek.id);
      } finally {
        await closePools();
      }
    });
  });
});
