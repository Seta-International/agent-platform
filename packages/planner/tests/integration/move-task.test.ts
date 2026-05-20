import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createBucket, createGroup, createPlan, createTask, moveTask } from '../../src/index.ts';
import { countEvents, readEvents, seedTenant } from '../helpers.ts';

describe('moveTask', () => {
  it('moves task across buckets, bumps version, emits planner.task.moved with before/after', async () => {
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
          const bucketA = await createBucket({ plan_id: plan.id, name: 'Bucket A', session });
          const bucketB = await createBucket({ plan_id: plan.id, name: 'Bucket B', session });
          const task = await createTask({
            plan_id: plan.id,
            bucket_id: bucketA.id,
            title: 'Move Me',
            session,
          });

          expect(task.bucket_id).toBe(bucketA.id);
          expect(task.version).toBe(1);

          const moved = await moveTask({
            task_id: task.id,
            expected_version: 1,
            to_bucket_id: bucketB.id,
            session,
          });

          expect(moved.bucket_id).toBe(bucketB.id);
          expect(moved.version).toBe(2);
          expect(moved.id).toBe(task.id);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.task.moved');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.task_id).toBe(task.id);
          expect(payload.plan_id).toBe(plan.id);
          expect(payload.group_id).toBe(group.id);
          expect(payload.before.bucket_id).toBe(bucketA.id);
          expect(payload.after.bucket_id).toBe(bucketB.id);
          expect(payload.version_before).toBe(1);
          expect(payload.version_after).toBe(2);
          expect(payload.actor.user_id).toBe(session.user_id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('reorders within same bucket (bucket_id unchanged, only sort_order changes)', async () => {
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
          const bucket = await createBucket({ plan_id: plan.id, name: 'Bucket', session });
          const taskA = await createTask({
            plan_id: plan.id,
            bucket_id: bucket.id,
            title: 'A',
            session,
          });
          const taskB = await createTask({
            plan_id: plan.id,
            bucket_id: bucket.id,
            title: 'B',
            session,
          });

          // Move taskB before taskA (to first position).
          const moved = await moveTask({
            task_id: taskB.id,
            expected_version: 1,
            to_bucket_id: bucket.id,
            after_task_id: undefined,
            session,
          });

          expect(moved.bucket_id).toBe(bucket.id);
          expect(moved.sort_order).toBeLessThan(taskA.sort_order);
          expect(moved.version).toBe(2);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.task.moved');
          // At least one event for the moved task
          const movedEvent = events.find(
            (e) => (e.payload as Record<string, unknown>).task_id === taskB.id,
          );
          expect(movedEvent).toBeDefined();
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = movedEvent?.payload as any;
          expect(payload.before.bucket_id).toBe(bucket.id);
          expect(payload.after.bucket_id).toBe(bucket.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('moves task to no-bucket (to_bucket_id = null)', async () => {
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
          const bucket = await createBucket({ plan_id: plan.id, name: 'Bucket', session });
          const task = await createTask({
            plan_id: plan.id,
            bucket_id: bucket.id,
            title: 'T',
            session,
          });

          const moved = await moveTask({
            task_id: task.id,
            expected_version: 1,
            to_bucket_id: null,
            session,
          });

          expect(moved.bucket_id).toBeNull();
          expect(moved.version).toBe(2);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.task.moved');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.before.bucket_id).toBe(bucket.id);
          expect(payload.after.bucket_id).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws VALIDATION when to_bucket_id belongs to a different plan', async () => {
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
          const plan1 = await createPlan({ group_id: group.id, name: 'Plan 1', session });
          const plan2 = await createPlan({ group_id: group.id, name: 'Plan 2', session });
          const bucket1 = await createBucket({ plan_id: plan1.id, name: 'Bucket 1', session });
          const bucket2 = await createBucket({ plan_id: plan2.id, name: 'Bucket 2', session });
          const task = await createTask({
            plan_id: plan1.id,
            bucket_id: bucket1.id,
            title: 'T',
            session,
          });

          await expect(
            moveTask({
              task_id: task.id,
              expected_version: 1,
              to_bucket_id: bucket2.id,
              session,
            }),
          ).rejects.toMatchObject({ code: 'VALIDATION' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws VALIDATION when to_bucket_id is soft-deleted', async () => {
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
          const bucketA = await createBucket({ plan_id: plan.id, name: 'Bucket A', session });
          const bucketB = await createBucket({ plan_id: plan.id, name: 'Bucket B', session });
          const task = await createTask({
            plan_id: plan.id,
            bucket_id: bucketA.id,
            title: 'T',
            session,
          });

          // Soft-delete bucketB directly.
          await pool.query(`UPDATE planner.buckets SET deleted_at = NOW() WHERE id = $1`, [
            bucketB.id,
          ]);

          await expect(
            moveTask({
              task_id: task.id,
              expected_version: 1,
              to_bucket_id: bucketB.id,
              session,
            }),
          ).rejects.toMatchObject({ code: 'VALIDATION' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws CONFLICT on stale version', async () => {
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
          const bucketB = await createBucket({ plan_id: plan.id, name: 'Bucket B', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });

          await expect(
            moveTask({
              task_id: task.id,
              expected_version: 99,
              to_bucket_id: bucketB.id,
              session,
            }),
          ).rejects.toMatchObject({ code: 'CONFLICT' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('triggers rebalance when gaps are too tight, emits multiple planner.task.moved events', async () => {
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
          const bucketA = await createBucket({ plan_id: plan.id, name: 'Bucket A', session });
          const bucketB = await createBucket({ plan_id: plan.id, name: 'Bucket B', session });

          // Create two tasks in bucketB with very tight sort_orders.
          const task1 = await createTask({
            plan_id: plan.id,
            bucket_id: bucketB.id,
            title: 'T1',
            session,
          });
          const task2 = await createTask({
            plan_id: plan.id,
            bucket_id: bucketB.id,
            title: 'T2',
            session,
          });

          // Manually set adjacent tasks to nearly-colliding sort_orders (gap < REBALANCE_THRESHOLD=100).
          await pool.query(`UPDATE planner.tasks SET sort_order = 1000 WHERE id = $1`, [task1.id]);
          await pool.query(`UPDATE planner.tasks SET sort_order = 1050 WHERE id = $1`, [task2.id]);

          // Create task in bucketA to move to bucketB between the tight tasks.
          const taskToMove = await createTask({
            plan_id: plan.id,
            bucket_id: bucketA.id,
            title: 'Move',
            session,
          });

          // Move into bucketB after task1 — this will trigger a rebalance.
          const moved = await moveTask({
            task_id: taskToMove.id,
            expected_version: 1,
            to_bucket_id: bucketB.id,
            after_task_id: task1.id,
            session,
          });

          expect(moved.bucket_id).toBe(bucketB.id);

          // All tasks in bucketB should now have 1M-spaced sort_orders.
          const { rows } = await pool.query(
            `SELECT sort_order FROM planner.tasks WHERE bucket_id = $1 AND deleted_at IS NULL ORDER BY sort_order`,
            [bucketB.id],
          );
          for (let i = 0; i < rows.length - 1; i++) {
            const gap = rows[i + 1].sort_order - rows[i].sort_order;
            expect(gap).toBeGreaterThanOrEqual(100);
          }

          // Multiple planner.task.moved events should have been emitted (one per rebalanced task).
          const eventCount = await countEvents(pool, seeded.tenant_id, 'planner.task.moved');
          expect(eventCount).toBeGreaterThanOrEqual(2);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
