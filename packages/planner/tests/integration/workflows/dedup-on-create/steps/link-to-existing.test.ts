import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  checklistItems,
  plannerDb,
  taskReferences,
  tasks,
} from '../../../../../src/backend/db/index.ts';
import { linkToExisting } from '../../../../../src/backend/workflows/dedup-on-create/steps/link-to-existing.ts';
import { createGroup, createPlan, createTask } from '../../../../../src/index.ts';
import { seedTenant } from '../../../../helpers.ts';

describe('linkToExisting', () => {
  it('mode=sub-task appends a checklist item to the existing task; creates no new task', async () => {
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
          const existing = await createTask({
            plan_id: plan.id,
            title: 'Original task',
            session,
          });

          const before = await plannerDb().select().from(tasks).where(eq(tasks.plan_id, plan.id));
          expect(before).toHaveLength(1);

          const out = await linkToExisting({
            existingId: existing.id,
            mode: 'sub-task',
            draft: {
              title: 'duplicate sub-task',
              description: '',
              skill_tags: [],
              plan_id: plan.id,
            },
            session,
          });

          expect(out.kind).toBe('sub-task-added');
          if (out.kind !== 'sub-task-added') throw new Error('unreachable');
          expect(out.existingId).toBe(existing.id);

          const items = await plannerDb()
            .select()
            .from(checklistItems)
            .where(eq(checklistItems.task_id, existing.id));
          expect(items).toHaveLength(1);
          expect(items[0]?.label).toBe('duplicate sub-task');

          const after = await plannerDb().select().from(tasks).where(eq(tasks.plan_id, plan.id));
          expect(after).toHaveLength(1); // no new task created
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('mode=related creates a new task with a task_reference pointing to existing', async () => {
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
          const existing = await createTask({ plan_id: plan.id, title: 'Original', session });

          const out = await linkToExisting({
            existingId: existing.id,
            mode: 'related',
            draft: {
              title: 'related dup',
              description: '',
              skill_tags: [],
              plan_id: plan.id,
            },
            session,
          });

          expect(out.kind).toBe('created');
          if (out.kind !== 'created') throw new Error('unreachable');
          expect(out.linkedTo).toBe(existing.id);

          const refs = await plannerDb()
            .select()
            .from(taskReferences)
            .where(
              and(
                eq(taskReferences.task_id, out.taskId),
                eq(taskReferences.url, `seta://planner/tasks/${existing.id}`),
              ),
            );
          expect(refs).toHaveLength(1);
          expect(refs[0]?.type).toBe('link');
          expect(refs[0]?.alias).toContain('Related');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('mode=related throws when draft.plan_id is missing', async () => {
    await expect(
      linkToExisting({
        existingId: 'e1',
        mode: 'related',
        // biome-ignore lint/suspicious/noExplicitAny: testing missing field
        draft: { title: 'x', description: '', skill_tags: [] } as any,
        // biome-ignore lint/suspicious/noExplicitAny: not used before error
        session: {} as any,
      }),
    ).rejects.toThrow(/plan_id is required/);
  });
});
