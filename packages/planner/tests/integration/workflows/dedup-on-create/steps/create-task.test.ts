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

          const out = await createTaskStep({
            draft: {
              title: 'New task',
              description: 'desc',
              skill_tags: ['a'],
              plan_id: plan.id,
            },
            session,
          });

          expect(out.taskId).toMatch(/^[0-9a-f-]{36}$/);
          const [row] = await plannerDb().select().from(tasks).where(eq(tasks.id, out.taskId));
          expect(row?.title).toBe('New task');
          expect(row?.tenant_id).toBe(seeded.tenant_id);
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
        draft: { title: 'x', description: '', skill_tags: [] } as any,
        // biome-ignore lint/suspicious/noExplicitAny: not used before error
        session: {} as any,
      }),
    ).rejects.toThrow(/plan_id is required/);
  });
});
