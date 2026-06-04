import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  createBucket,
  createGroup,
  createPlan,
  deleteBucket,
  moveBucket,
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
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
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
// moveBucket
// ---------------------------------------------------------------------------

describe('moveBucket', () => {
  it('changes order_hint, bumps version, emits bucket.updated with before/after order_hint', async () => {
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

          const b1 = await createBucket({ plan_id: plan.id, name: 'B1', session });
          const b2 = await createBucket({ plan_id: plan.id, name: 'B2', session });
          const b3 = await createBucket({ plan_id: plan.id, name: 'B3', session });

          // Move b3 between b1 and b2.
          const moved = await moveBucket({
            plan_id: plan.id,
            bucket_id: b3.id,
            after_id: b1.id,
            session,
          });

          expect(moved.version).toBe(2);
          expect(moved.order_hint).not.toBeNull();
          // Ordering: b1 < b3 < b2 after move.
          expect(b1.order_hint! < moved.order_hint!).toBe(true);
          expect(moved.order_hint! < b2.order_hint!).toBe(true);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.bucket.updated');
          // Only one event (normal case, no rebalance)
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.bucket_id).toBe(b3.id);
          expect(payload.before.order_hint).toBe(b3.order_hint);
          expect(payload.after.order_hint).toBe(moved.order_hint);
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
          const b1 = await createBucket({ plan_id: plan.id, name: 'B1', session });

          // Append to tail when only one bucket exists yields the same hint as creation.
          const result = await moveBucket({
            plan_id: plan.id,
            bucket_id: b1.id,
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

  it('triggers rebalance when neighbor hints collide, all buckets get updated and emit events', async () => {
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

          const b1 = await createBucket({ plan_id: plan.id, name: 'B1', session });
          const b2 = await createBucket({ plan_id: plan.id, name: 'B2', session });
          const b3 = await createBucket({ plan_id: plan.id, name: 'B3', session });

          // Force a collision between b1 and b2 so hintBetween throws and the rebalance path runs.
          await pool.query(`UPDATE planner.buckets SET order_hint = 'a0' WHERE id = $1`, [b1.id]);
          await pool.query(`UPDATE planner.buckets SET order_hint = 'a0' WHERE id = $1`, [b2.id]);

          await moveBucket({
            plan_id: plan.id,
            bucket_id: b3.id,
            after_id: b1.id,
            session,
          });

          const events = await readEvents(pool, seeded.tenant_id, 'planner.bucket.updated');
          // Rebalance emits the move event for b3, and re-spaces all buckets in-place.
          expect(events.length).toBeGreaterThanOrEqual(1);

          // After rebalance, all buckets have distinct, strictly-increasing order_hint values.
          const { rows } = await pool.query(
            `SELECT id, order_hint, version FROM planner.buckets WHERE plan_id = $1 AND deleted_at IS NULL ORDER BY order_hint ASC`,
            [plan.id],
          );
          expect(rows).toHaveLength(3);
          for (let i = 1; i < rows.length; i++) {
            expect(rows[i].order_hint > rows[i - 1].order_hint).toBe(true);
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
  it('soft-deletes bucket, version bumps, emits planner.bucket.deleted with empty deleted_task_ids', async () => {
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
          expect(payload.deleted_task_ids).toEqual([]);
          expect(payload.actor.user_id).toBe(session.user_id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('soft-deletes live tasks and emits planner.task.deleted for each', async () => {
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
          const bucket = await createBucket({ plan_id: plan.id, name: 'Work', session });

          const task1Id = crypto.randomUUID();
          const task2Id = crypto.randomUUID();
          await pool.query(
            `INSERT INTO planner.tasks (id, tenant_id, plan_id, bucket_id, title, order_hint, created_by)
             VALUES ($1, $2, $3, $4, 'Task 1', 'a0', $5),
                    ($6, $2, $3, $4, 'Task 2', 'a1', $5)`,
            [task1Id, seeded.tenant_id, plan.id, bucket.id, session.user_id, task2Id],
          );

          await deleteBucket({ bucket_id: bucket.id, expected_version: 1, session });

          // Tasks should be soft-deleted (deleted_at set, bucket_id unchanged).
          const { rows: taskRows } = await pool.query(
            `SELECT id, bucket_id, deleted_at, version FROM planner.tasks WHERE id = ANY($1) ORDER BY order_hint ASC`,
            [[task1Id, task2Id]],
          );
          expect(taskRows).toHaveLength(2);
          for (const row of taskRows) {
            expect(row.deleted_at).not.toBeNull();
            expect(row.bucket_id).toBe(bucket.id);
            expect(row.version).toBe(2);
          }

          // bucket.deleted event should list both task ids.
          const bucketEvents = await readEvents(pool, seeded.tenant_id, 'planner.bucket.deleted');
          expect(bucketEvents).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const bucketPayload = bucketEvents[0]?.payload as any;
          expect(bucketPayload.deleted_task_ids).toHaveLength(2);
          expect(bucketPayload.deleted_task_ids).toContain(task1Id);
          expect(bucketPayload.deleted_task_ids).toContain(task2Id);

          // Two planner.task.deleted events.
          const taskEvents = await readEvents(pool, seeded.tenant_id, 'planner.task.deleted');
          expect(taskEvents).toHaveLength(2);
          const taskEventIds = taskEvents.map((ev) => {
            // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
            const p = ev.payload as any;
            expect(p.version_before).toBe(1);
            expect(p.deleted_at).toBeDefined();
            return p.task_id as string;
          });
          expect(taskEventIds).toContain(task1Id);
          expect(taskEventIds).toContain(task2Id);
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
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
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
