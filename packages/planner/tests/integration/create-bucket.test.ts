import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createBucket, createGroup, createPlan } from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

describe('createBucket', () => {
  it('inserts a bucket with sort_order=1000000 when plan is empty, emits planner.bucket.created', async () => {
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

          const bucket = await createBucket({ plan_id: plan.id, name: 'To Do', session });

          expect(bucket.name).toBe('To Do');
          expect(bucket.sort_order).toBe(1_000_000);
          expect(bucket.version).toBe(1);
          expect(bucket.deleted_at).toBeNull();
          expect(bucket.plan_id).toBe(plan.id);
          expect(bucket.tenant_id).toBe(seeded.tenant_id);
          expect(bucket.id).toBeTypeOf('string');

          const events = await readEvents(pool, seeded.tenant_id, 'planner.bucket.created');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.after.bucket_id).toBe(bucket.id);
          expect(payload.after.plan_id).toBe(plan.id);
          expect(payload.after.group_id).toBe(group.id);
          expect(payload.after.name).toBe('To Do');
          expect(payload.after.sort_order).toBe(1_000_000);
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

  it('appends bucket at end when after_bucket_id is omitted', async () => {
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
          const b2 = await createBucket({ plan_id: plan.id, name: 'B2', session });

          expect(b1.sort_order).toBe(1_000_000);
          expect(b2.sort_order).toBe(2_000_000);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('inserts bucket after specified bucket using midpoint', async () => {
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
          const b3 = await createBucket({ plan_id: plan.id, name: 'B3', session });
          // Insert B2 between B1 and B3
          const b2 = await createBucket({
            plan_id: plan.id,
            name: 'B2',
            after_bucket_id: b1.id,
            session,
          });

          // midpoint of 1_000_000 and 2_000_000
          expect(b2.sort_order).toBe(1_500_000);
          expect(b1.sort_order).toBe(1_000_000);
          expect(b3.sort_order).toBe(2_000_000);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('appends after the last bucket when after_bucket_id is the last', async () => {
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
          const b2 = await createBucket({
            plan_id: plan.id,
            name: 'B2',
            after_bucket_id: b1.id,
            session,
          });

          // after is last, no next → sort_order = 1_000_000 + 1_000_000 = 2_000_000
          expect(b2.sort_order).toBe(2_000_000);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws VALIDATION when after_bucket_id does not exist in plan', async () => {
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

          await expect(
            createBucket({
              plan_id: plan.id,
              name: 'B',
              after_bucket_id: crypto.randomUUID(),
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

  it('throws NOT_FOUND when plan does not exist', async () => {
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
            createBucket({
              plan_id: crypto.randomUUID(),
              name: 'B',
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
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seededA = await seedTenant(pool);
          const seededB = await seedTenant(pool);

          const group = await createGroup({
            tenant_id: seededA.tenant_id,
            name: 'OtherTenantGroup',
            session: seededA.adminSession,
          });
          const plan = await createPlan({
            group_id: group.id,
            name: 'Sprint',
            session: seededA.adminSession,
          });

          await expect(
            createBucket({
              plan_id: plan.id,
              name: 'Infiltrate',
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
