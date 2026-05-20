import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createGroup } from '../../src/index.ts';
import { buildSession, readEvents, seedTenant } from '../helpers.ts';

describe('createGroup', () => {
  it('inserts a group, emits planner.group.created, returns version=1', async () => {
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
          const session = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: seeded.admin.user_id,
            email: seeded.admin.email,
            display_name: seeded.admin.name,
            roles: ['planner.admin'],
          });

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Engineering',
            session,
          });

          expect(group.name).toBe('Engineering');
          expect(group.version).toBe(1);
          expect(group.deleted_at).toBeNull();
          expect(group.created_by).toBe(session.user_id);
          expect(group.id).toBeTypeOf('string');

          const events = await readEvents(pool, seeded.tenant_id, 'planner.group.created');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB and we know its shape
          const payload = events[0]?.payload as any;
          expect(payload.after.name).toBe('Engineering');
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

  it('throws FORBIDDEN when session lacks planner.group.create', async () => {
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
          const session = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: crypto.randomUUID(),
            roles: ['planner.viewer'],
          });

          await expect(
            createGroup({ tenant_id: seeded.tenant_id, name: 'X', session }),
          ).rejects.toMatchObject({ name: 'PlannerError', code: 'FORBIDDEN' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws CROSS_TENANT when session.tenant_id != input.tenant_id', async () => {
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
          const session = buildSession({
            tenant_id: crypto.randomUUID(),
            user_id: seeded.admin.user_id,
            roles: ['planner.admin'],
          });

          await expect(
            createGroup({ tenant_id: seeded.tenant_id, name: 'X', session }),
          ).rejects.toMatchObject({ code: 'CROSS_TENANT' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects duplicate name within the same tenant (live rows)', async () => {
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
          const session = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: seeded.admin.user_id,
            roles: ['planner.admin'],
          });

          await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          await expect(
            createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session }),
          ).rejects.toThrow();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
