import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { plannerDb, taskReferences } from '../../../../../src/backend/db/index.ts';
import { linkToExisting } from '../../../../../src/backend/workflows/dedup-on-create/steps/link-to-existing.ts';
import { createGroup, createPlan, createTask } from '../../../../../src/index.ts';
import { seedTenant } from '../../../../helpers.ts';

describe('linkToExisting', () => {
  it('writes a relates link row on the new task pointing to the existing task', async () => {
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
          const existing = await createTask({
            plan_id: plan.id,
            title: 'Original task',
            session,
          });
          const newTask = await createTask({
            plan_id: plan.id,
            title: 'Duplicate task',
            session,
          });

          const out = await linkToExisting({
            taskId: newTask.id,
            existingId: existing.id,
            session,
          });

          // The output contract is UNCHANGED, so workflow.ts and its tests need
          // no reshaping — this is the mandatory regression.
          expect(out.kind).toBe('linked');
          if (out.kind !== 'linked') throw new Error('unreachable');
          expect(out.taskId).toBe(newTask.id);
          expect(out.linkedTo).toEqual([existing.id]);

          // ONE typed task_references row, and its url is the PLAN-FREE
          // canonical path: the identity of a domain relationship is no longer a
          // plan-scoped route that rots when the target moves plan (design §0.2).
          const links = await plannerDb()
            .select()
            .from(taskReferences)
            .where(eq(taskReferences.task_id, newTask.id));
          expect(links).toHaveLength(1);
          expect(links[0]).toMatchObject({
            url: `/planner/tasks/${existing.id}`,
            type: 'relates',
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
