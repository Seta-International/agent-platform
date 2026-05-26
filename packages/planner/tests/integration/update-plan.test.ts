import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createGroup, createPlan, updatePlan } from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

describe('updatePlan', () => {
  it('updates plan name, bumps version, emits planner.plan.updated', async () => {
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
          const plan = await createPlan({ group_id: group.id, name: 'Original', session });

          const updated = await updatePlan({
            plan_id: plan.id,
            expected_version: 1,
            patch: { name: 'Renamed' },
            session,
          });

          expect(updated.name).toBe('Renamed');
          expect(updated.version).toBe(2);
          expect(updated.id).toBe(plan.id);
          expect(updated.group_id).toBe(group.id);
          expect(updated.deleted_at).toBeNull();

          const events = await readEvents(pool, seeded.tenant_id, 'planner.plan.updated');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
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

  it('emits no field deltas when patch.name matches existing name', async () => {
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
          const plan = await createPlan({ group_id: group.id, name: 'SameName', session });

          const updated = await updatePlan({
            plan_id: plan.id,
            expected_version: 1,
            patch: { name: 'SameName' },
            session,
          });

          expect(updated.version).toBe(2);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.plan.updated');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.before).toEqual({});
          expect(payload.after).toEqual({});
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
          const plan = await createPlan({ group_id: group.id, name: 'ConflictTest', session });

          await expect(
            updatePlan({
              plan_id: plan.id,
              expected_version: 99,
              patch: { name: 'NewName' },
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

  it('throws NOT_FOUND for a nonexistent plan', async () => {
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
            updatePlan({
              plan_id: crypto.randomUUID(),
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
