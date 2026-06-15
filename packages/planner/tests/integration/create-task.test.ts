import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createBucket, createGroup, createPlan, createTask } from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

describe('createTask', () => {
  it('inserts a task with all defaults (no bucket, no priority), emits planner.task.created', async () => {
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

          const task = await createTask({ plan_id: plan.id, title: 'First task', session });

          expect(task.title).toBe('First task');
          expect(task.priority_number).toBe(5);
          expect(task.percent_complete).toBe(0);
          expect(task.is_deferred).toBe(false);
          expect(task.description).toBeNull();
          expect(task.due_at).toBeNull();
          expect(task.review_state).toBeNull();
          expect(task.bucket_id).toBeNull();
          expect(task.order_hint).not.toBeNull();
          expect(task.version).toBe(1);
          expect(task.deleted_at).toBeNull();
          expect(task.plan_id).toBe(plan.id);
          expect(task.tenant_id).toBe(seeded.tenant_id);
          expect(task.created_by).toBe(session.user_id);
          expect(task.id).toBeTypeOf('string');

          const events = await readEvents(pool, seeded.tenant_id, 'planner.task.created');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.after.task_id).toBe(task.id);
          expect(payload.after.plan_id).toBe(plan.id);
          expect(payload.after.group_id).toBe(group.id);
          expect(payload.after.bucket_id).toBeNull();
          expect(payload.after.title).toBe('First task');
          expect(payload.after.description).toBeNull();
          expect(payload.after.priority_number).toBe(5);
          expect(payload.after.due_at).toBeNull();
          expect(payload.after.review_state).toBeNull();
          expect(payload.after.order_hint).toBe(task.order_hint);
          expect(payload.after.created_by).toBe(session.user_id);
          expect(payload.group_id).toBe(group.id);
          expect(payload.actor.user_id).toBe(session.user_id);
          expect(payload.actor.type).toBe('user');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('places task at end of bucket scope when bucket_id is specified', async () => {
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
          const bucket = await createBucket({ plan_id: plan.id, name: 'Backlog', session });

          const t1 = await createTask({
            plan_id: plan.id,
            bucket_id: bucket.id,
            title: 'T1',
            session,
          });
          const t2 = await createTask({
            plan_id: plan.id,
            bucket_id: bucket.id,
            title: 'T2',
            session,
          });

          expect(t1.order_hint).not.toBeNull();
          expect(t2.order_hint).not.toBeNull();
          expect(t1.order_hint! < t2.order_hint!).toBe(true);
          expect(t1.bucket_id).toBe(bucket.id);
          expect(t2.bucket_id).toBe(bucket.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws VALIDATION when bucket_id belongs to a different plan', async () => {
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
          const planA = await createPlan({ group_id: group.id, name: 'Sprint A', session });
          const planB = await createPlan({ group_id: group.id, name: 'Sprint B', session });
          const bucketInB = await createBucket({ plan_id: planB.id, name: 'B Bucket', session });

          await expect(
            createTask({
              plan_id: planA.id,
              bucket_id: bucketInB.id,
              title: 'Cross-plan task',
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

  it('throws VALIDATION when bucket_id is soft-deleted', async () => {
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
          const bucket = await createBucket({ plan_id: plan.id, name: 'Old Bucket', session });

          // Soft-delete the bucket directly.
          await pool.query(`UPDATE planner.buckets SET deleted_at = NOW() WHERE id = $1`, [
            bucket.id,
          ]);

          await expect(
            createTask({
              plan_id: plan.id,
              bucket_id: bucket.id,
              title: 'Task in dead bucket',
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

  it('throws NOT_FOUND when plan_id does not exist', async () => {
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
            createTask({
              plan_id: crypto.randomUUID(),
              title: 'Ghost task',
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

  it('throws CROSS_TENANT when plan belongs to another tenant', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seededA = await seedTenant(pool);
          const seededB = await seedTenant(pool);

          const group = await createGroup({
            tenant_id: seededA.tenant_id,
            name: 'Eng A',
            session: seededA.adminSession,
          });
          const plan = await createPlan({
            group_id: group.id,
            name: 'Sprint A',
            session: seededA.adminSession,
          });

          await expect(
            createTask({
              plan_id: plan.id,
              title: 'Infiltrate',
              session: seededB.adminSession,
            }),
          ).rejects.toMatchObject({ code: 'CROSS_TENANT' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
