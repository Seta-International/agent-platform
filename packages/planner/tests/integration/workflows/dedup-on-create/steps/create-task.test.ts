import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { plannerDb, tasks } from '../../../../../src/backend/db/index.ts';
import { createTaskStep } from '../../../../../src/backend/workflows/dedup-on-create/steps/create-task.ts';
import { createGroup, createPlan } from '../../../../../src/index.ts';
import { seedTenant } from '../../../../helpers.ts';

describe('createTaskStep', () => {
  it('inserts a task via planner domain and returns its id', async () => {
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

          const out = await createTaskStep({
            draft: {
              title: 'New task',
              description: 'desc',
              labels: ['a'],
              plan_id: plan.id,
            },
            session,
          });

          expect(out.taskId).toMatch(/^[0-9a-f-]{36}$/);
          const [row] = await plannerDb().select().from(tasks).where(eq(tasks.id, out.taskId));
          expect(row?.title).toBe('New task');
          expect(row?.tenant_id).toBe(seeded.tenant_id);

          // Verify label 'a' was applied to the task via the labels join tables
          const labelRows = await pool.query<{ name: string }>(
            `SELECT l.name
               FROM planner.task_labels tl
               JOIN planner.labels l ON l.id = tl.label_id
               WHERE tl.task_id = $1`,
            [out.taskId],
          );
          expect(labelRows.rows.map((r) => r.name)).toContain('a');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws when draft.plan_id is missing', async () => {
    await expect(
      createTaskStep({
        // biome-ignore lint/suspicious/noExplicitAny: testing missing field
        draft: { title: 'x', description: '', labels: [] } as any,
        // biome-ignore lint/suspicious/noExplicitAny: not used before error
        session: {} as any,
      }),
    ).rejects.toThrow(/plan_id is required/);
  });
});
