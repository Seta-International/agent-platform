import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { queryTasks } from '../../../src/backend/agent-tools/query-tasks.ts';
import { createGroup, createPlan, createTask, getPlanChartData } from '../../../src/index.ts';
import { seedTenant } from '../../helpers.ts';

function testDbOpts() {
  return {
    templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
    baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
  };
}

// 2026-07-29T17:30:00Z is 2026-07-30 00:30 ICT.
const NOW = new Date('2026-07-29T17:30:00Z');

describe('queryTasks lateness fields (FUT-800 AC3)', () => {
  it('flags overdue tasks and counts local calendar days to due', async () => {
    await withTestDb(testDbOpts(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });

        const late = await createTask({
          plan_id: plan.id,
          title: 'late',
          due_at: '2026-07-28T03:00:00Z',
          session,
        });
        // 23:00 ICT on the same local day as NOW: due today, not yet late.
        const dueToday = await createTask({
          plan_id: plan.id,
          title: 'due-today',
          due_at: '2026-07-30T16:00:00Z',
          session,
        });
        const undated = await createTask({ plan_id: plan.id, title: 'undated', session });

        const result = await queryTasks({
          planId: plan.id,
          status: 'any',
          session,
          now: NOW,
        });
        const byId = new Map(result.tasks.map((t) => [t.taskId, t]));

        expect(byId.get(late.id)?.isOverdue).toBe(true);
        expect(byId.get(late.id)?.daysUntilDue).toBe(-2);

        expect(byId.get(dueToday.id)?.isOverdue).toBe(false);
        expect(byId.get(dueToday.id)?.daysUntilDue).toBe(0);

        expect(byId.get(undated.id)?.isOverdue).toBe(false);
        expect(byId.get(undated.id)?.daysUntilDue).toBeNull();
      } finally {
        await closePools();
      }
    });
  });

  it('agrees with the plan chart late count on the same fixture', async () => {
    await withTestDb(testDbOpts(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });

        await createTask({
          plan_id: plan.id,
          title: 'late',
          due_at: '2026-07-28T03:00:00Z',
          session,
        });
        await createTask({
          plan_id: plan.id,
          title: 'due-today',
          due_at: '2026-07-30T16:00:00Z',
          session,
        });
        await createTask({ plan_id: plan.id, title: 'undated', session });

        const chart = await getPlanChartData({ plan_id: plan.id }, session, NOW);
        const queried = await queryTasks({ planId: plan.id, status: 'any', session, now: NOW });
        const overdueCount = queried.tasks.filter((t) => t.isOverdue).length;

        expect(chart.kpis.late).toBe(overdueCount);
        expect(overdueCount).toBe(1);
      } finally {
        await closePools();
      }
    });
  });
});
