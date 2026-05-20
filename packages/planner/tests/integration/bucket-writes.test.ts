import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  createBucket,
  createGroup,
  createPlan,
  deleteBucket,
  reorderBucket,
  updateBucket,
} from '../../src/index.ts';
import { countEvents, readEvents, seedTenant } from '../helpers.ts';

// ---------------------------------------------------------------------------
// updateBucket
// ---------------------------------------------------------------------------

describe('updateBucket', () => {
  it('updates bucket name, bumps version, emits planner.bucket.updated with before/after', async () => {
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
          const bucket = await createBucket({ plan_id: plan.id, name: 'Original', session });

          const updated = await updateBucket({
            bucket_id: bucket.id,
            expected_version: 1,
            patch: { name: 'Renamed' },
            session,
          });

          expect(updated.name).toBe('Renamed');
          expect(updated.version).toBe(2);
          expect(updated.id).toBe(bucket.id);
          expect(updated.plan_id).toBe(plan.id);
          expect(updated.deleted_at).toBeNull();

          const events = await readEvents(pool, seeded.tenant_id, 'planner.bucket.updated');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.bucket_id).toBe(bucket.id);
          expect(payload.plan_id).toBe(plan.id);
          expect(payload.group_id).toBe(group.id);
          expect(payload.before.name).toBe('Original');
          expect(payload.after.name).toBe('Renamed');
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

  it('throws CONFLICT when expected_version is stale', async () => {
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
          const bucket = await createBucket({ plan_id: plan.id, name: 'B1', session });

          await expect(
            updateBucket({
              bucket_id: bucket.id,
              expected_version: 99,
              patch: { name: 'New' },
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

  it('throws NOT_FOUND for a nonexistent bucket', async () => {
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

          await expect(
            updateBucket({
              bucket_id: crypto.randomUUID(),
              expected_version: 1,
              patch: { name: 'Ghost' },
              session: seeded.adminSession,
            }),
          ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// reorderBucket
// ---------------------------------------------------------------------------

describe('reorderBucket', () => {
  it('changes sort_order, bumps version, emits bucket.updated with before/after sort_order', async () => {
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

          const b1 = await createBucket({ plan_id: plan.id, name: 'B1', session });
          await createBucket({ plan_id: plan.id, name: 'B2', session });
          const b3 = await createBucket({ plan_id: plan.id, name: 'B3', session });

          // Move b3 between b1 and the second bucket (B2).
          const reordered = await reorderBucket({
            bucket_id: b3.id,
            expected_version: 1,
            after_bucket_id: b1.id,
            session,
          });

          expect(reordered.version).toBe(2);
          // midpoint of 1_000_000 and 2_000_000 = 1_500_000
          expect(reordered.sort_order).toBe(1_500_000);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.bucket.updated');
          // Only one event (normal case, no rebalance)
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.bucket_id).toBe(b3.id);
          expect(payload.before.sort_order).toBe(b3.sort_order);
          expect(payload.after.sort_order).toBe(1_500_000);
          expect(payload.version_before).toBe(1);
          expect(payload.version_after).toBe(2);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('no-op: moving bucket to its current position does not change version or emit', async () => {
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
          const b1 = await createBucket({ plan_id: plan.id, name: 'B1', session });

          const result = await reorderBucket({
            bucket_id: b1.id,
            expected_version: 1,
            after_bucket_id: b1.id,
            session,
          });

          expect(result.version).toBe(1);
          const eventCount = await countEvents(pool, seeded.tenant_id, 'planner.bucket.updated');
          expect(eventCount).toBe(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('triggers rebalance when gap drops below threshold, all buckets get updated and emit events', async () => {
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

          // Create 3 buckets, then manually set sort_orders to 100, 200, 300 to be near threshold.
          const b1 = await createBucket({ plan_id: plan.id, name: 'B1', session });
          const b2 = await createBucket({ plan_id: plan.id, name: 'B2', session });
          const b3 = await createBucket({ plan_id: plan.id, name: 'B3', session });

          await pool.query(`UPDATE planner.buckets SET sort_order = $1 WHERE id = $2`, [
            100,
            b1.id,
          ]);
          await pool.query(`UPDATE planner.buckets SET sort_order = $1 WHERE id = $2`, [
            200,
            b2.id,
          ]);
          await pool.query(`UPDATE planner.buckets SET sort_order = $1 WHERE id = $2`, [
            300,
            b3.id,
          ]);

          // Reorder: move b3 between b1 (100) and b2 (200).
          // midpoint = 150, gap from 100→150 = 50 < 100 → rebalance triggered.
          await reorderBucket({
            bucket_id: b3.id,
            expected_version: 1,
            after_bucket_id: b1.id,
            session,
          });

          const events = await readEvents(pool, seeded.tenant_id, 'planner.bucket.updated');
          // All 3 buckets get updated during rebalance.
          expect(events).toHaveLength(3);

          // After rebalance, buckets should be at 1_000_000 spacing.
          const { rows } = await pool.query(
            `SELECT id, sort_order, version FROM planner.buckets WHERE plan_id = $1 AND deleted_at IS NULL ORDER BY sort_order ASC`,
            [plan.id],
          );
          expect(rows).toHaveLength(3);
          // Each bucket's sort_order should be a multiple of 1_000_000.
          for (const row of rows) {
            expect(row.sort_order % 1_000_000).toBe(0);
          }
          // Each should have version bumped to 2.
          for (const row of rows) {
            expect(row.version).toBe(2);
          }
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// deleteBucket
// ---------------------------------------------------------------------------

describe('deleteBucket', () => {
  it('soft-deletes bucket, version bumps, emits planner.bucket.deleted with empty reflowed_task_ids', async () => {
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
          const bucket = await createBucket({ plan_id: plan.id, name: 'Empty Bucket', session });

          await deleteBucket({ bucket_id: bucket.id, expected_version: 1, session });

          const { rows } = await pool.query(
            `SELECT deleted_at, version FROM planner.buckets WHERE id = $1`,
            [bucket.id],
          );
          expect(rows[0].deleted_at).not.toBeNull();
          expect(rows[0].version).toBe(2);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.bucket.deleted');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.bucket_id).toBe(bucket.id);
          expect(payload.plan_id).toBe(plan.id);
          expect(payload.group_id).toBe(group.id);
          expect(payload.version_before).toBe(1);
          expect(payload.reflowed_task_ids).toEqual([]);
          expect(payload.actor.user_id).toBe(session.user_id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('reflows live tasks to bucket_id=null and emits planner.task.moved for each', async () => {
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
          const bucket = await createBucket({ plan_id: plan.id, name: 'Work', session });

          // Insert two tasks directly via raw SQL since createTask is not yet implemented.
          const task1Id = crypto.randomUUID();
          const task2Id = crypto.randomUUID();
          await pool.query(
            `INSERT INTO planner.tasks (id, tenant_id, plan_id, bucket_id, title, sort_order, created_by)
             VALUES ($1, $2, $3, $4, 'Task 1', 1000000, $5),
                    ($6, $2, $3, $4, 'Task 2', 2000000, $5)`,
            [task1Id, seeded.tenant_id, plan.id, bucket.id, session.user_id, task2Id],
          );

          await deleteBucket({ bucket_id: bucket.id, expected_version: 1, session });

          // Tasks should now have bucket_id = null.
          const { rows: taskRows } = await pool.query(
            `SELECT id, bucket_id, version FROM planner.tasks WHERE id = ANY($1) ORDER BY sort_order ASC`,
            [[task1Id, task2Id]],
          );
          expect(taskRows).toHaveLength(2);
          for (const row of taskRows) {
            expect(row.bucket_id).toBeNull();
            expect(row.version).toBe(2);
          }

          // Check bucket.deleted event has both task ids.
          const bucketEvents = await readEvents(pool, seeded.tenant_id, 'planner.bucket.deleted');
          expect(bucketEvents).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const bucketPayload = bucketEvents[0]?.payload as any;
          expect(bucketPayload.reflowed_task_ids).toHaveLength(2);
          expect(bucketPayload.reflowed_task_ids).toContain(task1Id);
          expect(bucketPayload.reflowed_task_ids).toContain(task2Id);

          // Two planner.task.moved events.
          const taskEvents = await readEvents(pool, seeded.tenant_id, 'planner.task.moved');
          expect(taskEvents).toHaveLength(2);
          for (const ev of taskEvents) {
            // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
            const p = ev.payload as any;
            expect(p.before.bucket_id).toBe(bucket.id);
            expect(p.after.bucket_id).toBeNull();
            expect(p.before.sort_order).toBe(p.after.sort_order);
            expect(p.version_before).toBe(1);
            expect(p.version_after).toBe(2);
          }
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws CONFLICT when expected_version is stale', async () => {
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
          const bucket = await createBucket({ plan_id: plan.id, name: 'B', session });

          await expect(
            deleteBucket({ bucket_id: bucket.id, expected_version: 99, session }),
          ).rejects.toMatchObject({ code: 'CONFLICT' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws NOT_FOUND for a nonexistent or already-deleted bucket', async () => {
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

          await expect(
            deleteBucket({
              bucket_id: crypto.randomUUID(),
              expected_version: 1,
              session: seeded.adminSession,
            }),
          ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
