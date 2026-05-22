import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { addGroupMember, createGroup, createPlan } from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

describe('createPlan', () => {
  it('inserts a plan, emits planner.plan.created, returns version=1', async () => {
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

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session,
          });

          const plan = await createPlan({
            group_id: group.id,
            name: 'Sprint 1',
            session,
          });

          expect(plan.name).toBe('Sprint 1');
          expect(plan.version).toBe(1);
          expect(plan.deleted_at).toBeNull();
          expect(plan.created_by).toBe(session.user_id);
          expect(plan.group_id).toBe(group.id);
          expect(plan.tenant_id).toBe(seeded.tenant_id);
          expect(plan.id).toBeTypeOf('string');

          const events = await readEvents(pool, seeded.tenant_id, 'planner.plan.created');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB and we know its shape
          const payload = events[0]?.payload as any;
          expect(payload.after.name).toBe('Sprint 1');
          expect(payload.after.group_id).toBe(group.id);
          expect(payload.after.plan_id).toBe(plan.id);
          expect(payload.after.created_by).toBe(session.user_id);
          expect(payload.actor.user_id).toBe(session.user_id);
          expect(payload.actor.type).toBe('user');
          expect(payload.group_id).toBe(group.id);
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
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
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

          await pool.query(
            `DELETE FROM core.events WHERE event_type = 'core.notification.requested' AND tenant_id = $1`,
            [seeded.tenant_id],
          );

          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });

          const events = await readEvents(pool, seeded.tenant_id, 'core.notification.requested');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.target_event_type).toBe('planner.plan.created');
          expect((payload.user_ids as string[]).sort()).toEqual(
            [bob.user_id, carol.user_id].sort(),
          );
          expect(payload.target_payload.plan_id).toBe(plan.id);
          expect(payload.target_payload.group_id).toBe(group.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws NOT_FOUND when parent group does not exist', async () => {
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
            createPlan({
              group_id: crypto.randomUUID(),
              name: 'Orphan',
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

  it('throws CROSS_TENANT when group belongs to another tenant', async () => {
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

          await expect(
            createPlan({
              group_id: group.id,
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
