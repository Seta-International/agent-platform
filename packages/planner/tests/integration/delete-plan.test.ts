import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  addGroupMember,
  createGroup,
  createPlan,
  deletePlan,
  restorePlan,
} from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

describe('deletePlan', () => {
  it('soft-deletes the plan, emits planner.plan.deleted', async () => {
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

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session,
          });
          const plan = await createPlan({ group_id: group.id, name: 'ToDelete', session });

          await deletePlan({ plan_id: plan.id, expected_version: 1, session });

          const { rows } = await pool.query(
            `SELECT deleted_at, version FROM planner.plans WHERE id = $1`,
            [plan.id],
          );
          expect(rows[0].deleted_at).not.toBeNull();
          expect(rows[0].version).toBe(2);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.plan.deleted');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.plan_id).toBe(plan.id);
          expect(payload.group_id).toBe(group.id);
          expect(payload.version_before).toBe(1);
          expect(payload.deleted_at).toBeTypeOf('string');
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

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session,
          });
          const plan = await createPlan({ group_id: group.id, name: 'ConflictDelete', session });

          await expect(
            deletePlan({ plan_id: plan.id, expected_version: 99, session }),
          ).rejects.toMatchObject({ code: 'CONFLICT' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('requests a notification to all group members except the actor', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [
              { name: 'Bob', email: 'bob@example.test' },
              { name: 'Carol', email: 'carol@example.test' },
            ],
          });
          const session = seeded.adminSession;
          const bob = seeded.users[0]!;
          const carol = seeded.users[1]!;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          await addGroupMember({ group_id: group.id, user_id: session.user_id, session });
          await addGroupMember({ group_id: group.id, user_id: bob.user_id, session });
          await addGroupMember({ group_id: group.id, user_id: carol.user_id, session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });

          await pool.query(
            `DELETE FROM core.events WHERE event_type = 'notification.requested' AND tenant_id = $1`,
            [seeded.tenant_id],
          );

          await deletePlan({ plan_id: plan.id, expected_version: 1, session });

          const events = await readEvents(pool, seeded.tenant_id, 'notification.requested');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.target_event_type).toBe('planner.plan.deleted');
          expect((payload.user_ids as string[]).sort()).toEqual(
            [bob.user_id, carol.user_id].sort(),
          );
          expect(payload.target_payload.group_id).toBe(group.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws NOT_FOUND for a deleted or nonexistent plan', async () => {
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
            deletePlan({
              plan_id: crypto.randomUUID(),
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

describe('restorePlan', () => {
  it('restores a deleted plan, bumps version, emits planner.plan.restored', async () => {
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

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session,
          });
          const plan = await createPlan({ group_id: group.id, name: 'ToRestore', session });
          await deletePlan({ plan_id: plan.id, expected_version: 1, session });

          const restored = await restorePlan({ plan_id: plan.id, session });

          expect(restored.deleted_at).toBeNull();
          expect(restored.version).toBe(3);
          expect(restored.group_id).toBe(group.id);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.plan.restored');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.plan_id).toBe(plan.id);
          expect(payload.group_id).toBe(group.id);
          expect(payload.version_after).toBe(3);
          expect(payload.actor.user_id).toBe(session.user_id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws VALIDATION when restoring a live plan', async () => {
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

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session,
          });
          const plan = await createPlan({ group_id: group.id, name: 'StillLive', session });

          await expect(restorePlan({ plan_id: plan.id, session })).rejects.toMatchObject({
            code: 'VALIDATION',
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws NOT_FOUND for nonexistent plan', async () => {
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
            restorePlan({ plan_id: crypto.randomUUID(), session: seeded.adminSession }),
          ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
