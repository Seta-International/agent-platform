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
  it('adds a task_reference on the new task pointing to the existing task', async () => {
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

          expect(out.kind).toBe('linked');
          if (out.kind !== 'linked') throw new Error('unreachable');
          expect(out.taskId).toBe(newTask.id);
          expect(out.linkedTo).toBe(existing.id);

          const refs = await plannerDb()
            .select()
            .from(taskReferences)
            .where(eq(taskReferences.task_id, newTask.id));
          expect(refs).toHaveLength(1);
          expect(refs[0]?.url).toBe(`seta://planner/tasks/${existing.id}`);
          expect(refs[0]?.type).toBe('link');
          expect(refs[0]?.alias).toContain('Related');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
