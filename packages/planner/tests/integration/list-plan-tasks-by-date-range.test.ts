import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  assignTask,
  createGroup,
  createPlan,
  createTask,
  deleteTask,
  listPlanTasksByDateRange,
} from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const JUNE_FROM = '2026-06-01T00:00:00.000Z';
const JUNE_TO = '2026-06-30T23:59:59.999Z';

function testDbOpts() {
  return {
    templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
    baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
  };
}

describe('listPlanTasksByDateRange', () => {
  it('includes overlapping tasks, excludes out-of-range / no-date / deleted (AC-3, AC-4, AC-5)', async () => {
    await withTestDb(testDbOpts(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });

        const mk = (title: string, start_at?: string, due_at?: string) =>
          createTask({ plan_id: plan.id, title, start_at, due_at, session });

        // Included — every overlap shape from the spec matrix:
        const inside = await mk('inside', '2026-06-10T00:00:00Z', '2026-06-12T00:00:00Z');
        const spansIn = await mk('spans-in', '2026-05-20T00:00:00Z', '2026-06-05T00:00:00Z');
        const spansOut = await mk('spans-out', '2026-06-28T00:00:00Z', '2026-07-03T00:00:00Z');
        const covers = await mk('covers', '2026-05-01T00:00:00Z', '2026-07-31T00:00:00Z');
        const dueOnlyIn = await mk('due-only-in', undefined, '2026-06-15T00:00:00Z');
        const startOnlyIn = await mk('start-only-in', '2026-06-20T00:00:00Z', undefined);

        // Excluded:
        await mk('before', '2026-05-01T00:00:00Z', '2026-05-30T00:00:00Z');
        await mk('after', '2026-07-01T00:00:00Z', '2026-07-02T00:00:00Z');
        await mk('due-only-out', undefined, '2026-05-15T00:00:00Z');
        await mk('no-dates');
        const deleted = await mk('deleted', '2026-06-10T00:00:00Z', '2026-06-11T00:00:00Z');
        await deleteTask({ task_id: deleted.id, expected_version: deleted.version, session });

        const result = await listPlanTasksByDateRange(
          { plan_id: plan.id, from: JUNE_FROM, to: JUNE_TO },
          session,
        );

        const ids = new Set(result.tasks.map((t) => t.id));
        expect(ids).toEqual(
          new Set([inside.id, spansIn.id, spansOut.id, covers.id, dueOnlyIn.id, startOnlyIn.id]),
        );
        expect(result.total_count).toBe(6); // AC-9
        expect(result.next_cursor).toBeUndefined();
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('returns TaskWithAssigneesRow shape (assignees, labels, checklist_summary)', async () => {
    await withTestDb(testDbOpts(), async ({ pool, databaseUrl }) => {
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
        const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });
        const task = await createTask({
          plan_id: plan.id,
          title: 'Scheduled',
          due_at: '2026-06-10T12:00:00Z',
          session,
        });
        await assignTask({ task_id: task.id, user_id: alice.user_id, session });

        const result = await listPlanTasksByDateRange(
          { plan_id: plan.id, from: JUNE_FROM, to: JUNE_TO },
          session,
        );

        expect(result.tasks).toHaveLength(1);
        const t = result.tasks[0]!;
        expect(t.assignees).toHaveLength(1);
        expect(t.assignees[0]!.user_id).toBe(alice.user_id);
        expect(t.labels).toEqual([]);
        expect(t.checklist_summary).toEqual({ total: 0, checked: 0 });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('paginates with keyset cursor; total_count is page-independent (AC-7, AC-9)', async () => {
    await withTestDb(testDbOpts(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });

        for (let i = 0; i < 5; i++) {
          await createTask({
            plan_id: plan.id,
            title: `t${i}`,
            due_at: `2026-06-1${i}T00:00:00Z`,
            session,
          });
        }

        const page1 = await listPlanTasksByDateRange(
          { plan_id: plan.id, from: JUNE_FROM, to: JUNE_TO, limit: 2 },
          session,
        );
        expect(page1.tasks).toHaveLength(2);
        expect(page1.total_count).toBe(5);
        expect(page1.next_cursor).toBeDefined();

        const page2 = await listPlanTasksByDateRange(
          { plan_id: plan.id, from: JUNE_FROM, to: JUNE_TO, limit: 2, cursor: page1.next_cursor },
          session,
        );
        expect(page2.tasks).toHaveLength(2);
        expect(page2.total_count).toBe(5);
        expect(page2.next_cursor).toBeDefined();

        const page3 = await listPlanTasksByDateRange(
          { plan_id: plan.id, from: JUNE_FROM, to: JUNE_TO, limit: 2, cursor: page2.next_cursor },
          session,
        );
        expect(page3.tasks).toHaveLength(1);
        expect(page3.next_cursor).toBeUndefined();

        const allIds = [...page1.tasks, ...page2.tasks, ...page3.tasks].map((t) => t.id);
        expect(new Set(allIds).size).toBe(5); // no duplicates across pages
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects an unknown plan', async () => {
    await withTestDb(testDbOpts(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        await expect(
          listPlanTasksByDateRange(
            {
              plan_id: '00000000-0000-0000-0000-000000000000',
              from: JUNE_FROM,
              to: JUNE_TO,
            },
            seeded.adminSession,
          ),
        ).rejects.toThrow('Plan not found');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
