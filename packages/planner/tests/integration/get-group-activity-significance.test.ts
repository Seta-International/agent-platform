import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  createBucket,
  createGroup,
  createPlan,
  createTask,
  getGroupActivity,
  moveTask,
} from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const dbCfg = () => ({
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
});

describe('getGroupActivity significance filter', () => {
  it('shows one item for a column move and hides same-bucket reorders', async () => {
    await withTestDb(dbCfg(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });
        const todo = await createBucket({ plan_id: plan.id, name: 'To Do', session });
        const doing = await createBucket({ plan_id: plan.id, name: 'In Progress', session });
        const t = await createTask({ plan_id: plan.id, bucket_id: todo.id, title: 'T', session });

        // Column move: To Do -> In Progress
        const moved = await moveTask({
          task_id: t.id,
          bucket_id: doing.id,
          expected_version: t.version,
          session,
        });
        // Same-bucket reorder (no bucket change): should NOT appear.
        await moveTask({
          task_id: moved.id,
          bucket_id: doing.id,
          expected_version: moved.version,
          session,
        });

        const result = await getGroupActivity({ group_id: group.id, limit: 50, session });
        const moves = result.items.filter((i) => i.event_type === 'planner.task.moved');
        expect(moves).toHaveLength(1);
        // The task.updated move-twin must not appear either.
        const updates = result.items.filter((i) => i.event_type === 'planner.task.updated');
        expect(updates).toHaveLength(0);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('keeps a full page of limit items and a working cursor when noise is interleaved', async () => {
    await withTestDb(dbCfg(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });
        const b1 = await createBucket({ plan_id: plan.id, name: 'B1', session });
        // Create 8 tasks (8 significant created events) and reorder each once (noise).
        for (let i = 0; i < 8; i++) {
          const t = await createTask({
            plan_id: plan.id,
            bucket_id: b1.id,
            title: `T${i}`,
            session,
          });
          await moveTask({ task_id: t.id, bucket_id: b1.id, expected_version: t.version, session });
        }
        const page1 = await getGroupActivity({ group_id: group.id, limit: 3, session });
        expect(page1.items).toHaveLength(3); // no short page despite interleaved noise
        expect(page1.has_more).toBe(true);
        expect(page1.next_cursor).toBeDefined();
        // No noise leaked in.
        expect(page1.items.every((i) => i.event_type !== 'planner.task.updated')).toBe(true);

        const page2 = await getGroupActivity({
          group_id: group.id,
          cursor: page1.next_cursor!,
          limit: 3,
          session,
        });
        const ids = new Set(page1.items.map((i) => i.event_id));
        for (const it of page2.items) expect(ids.has(it.event_id)).toBe(false);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
