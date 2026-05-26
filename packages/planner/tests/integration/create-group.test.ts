import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createGroup } from '../../src/index.ts';
import { buildSession, readEvents, seedTenant } from '../helpers.ts';

describe('createGroup', () => {
  it('inserts a group, emits planner.group.created, returns version=1', async () => {
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
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
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
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
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

  it('persists description/theme/visibility/default_role and emits them in the created event', async () => {
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
          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Engineering',
            description: 'Platform work',
            theme: 'green',
            visibility: 'public',
            default_role: 'owner',
            session: seeded.adminSession,
          });
          expect(group.description).toBe('Platform work');
          expect(group.theme).toBe('green');
          expect(group.visibility).toBe('public');
          expect(group.default_role).toBe('owner');
          expect(group.external_source).toBe('native');
          expect(group.external_id).toBeNull();

          const events = await readEvents(pool, seeded.tenant_id, 'planner.group.created');
          const after = (events[0]?.payload as { after: { description: string; theme: string } })
            .after;
          expect(after.description).toBe('Platform work');
          expect(after.theme).toBe('green');
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
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
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

  it('auto-adds the creator as owner in group_members', async () => {
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
          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'AutoOwner',
            session: seeded.adminSession,
          });
          const { rows } = await pool.query(
            `SELECT user_id, role FROM planner.group_members WHERE group_id = $1`,
            [group.id],
          );
          expect(rows).toHaveLength(1);
          expect(rows[0].user_id).toBe(seeded.admin.user_id);
          expect(rows[0].role).toBe('owner');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('deduplicates creator when also supplied in initial_members', async () => {
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
          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'DedupOwner',
            session: seeded.adminSession,
            initial_members: [{ user_id: seeded.admin.user_id, role: 'member' }],
          });
          const { rows } = await pool.query(
            `SELECT user_id, role FROM planner.group_members WHERE group_id = $1`,
            [group.id],
          );
          // creator appears exactly once (onConflictDoNothing handles duplicate)
          expect(rows).toHaveLength(1);
          // creator's owner role wins over the caller-supplied member role
          expect(rows[0].role).toBe('owner');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
