import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createGroup, updateGroup } from '../../src/index.ts';
import { buildSession, readEvents, seedTenant } from '../helpers.ts';

describe('updateGroup', () => {
  it('updates group name, bumps version, emits planner.group.updated', async () => {
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
            name: 'Original',
            session,
          });

          const updated = await updateGroup({
            group_id: group.id,
            expected_version: 1,
            patch: { name: 'Renamed' },
            session,
          });

          expect(updated.name).toBe('Renamed');
          expect(updated.version).toBe(2);
          expect(updated.id).toBe(group.id);
          expect(updated.deleted_at).toBeNull();

          const events = await readEvents(pool, seeded.tenant_id, 'planner.group.updated');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
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

  it('skips emit and version bump when patch is a no-op', async () => {
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
            name: 'SameName',
            session,
          });

          const updated = await updateGroup({
            group_id: group.id,
            expected_version: 1,
            patch: { name: 'SameName' },
            session,
          });

          expect(updated.version).toBe(1);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.group.updated');
          expect(events).toHaveLength(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('updates description/theme/visibility/default_role and emits changed_fields', async () => {
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
          const g = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'X',
            session: seeded.adminSession,
          });
          const u = await updateGroup({
            group_id: g.id,
            expected_version: 1,
            patch: { description: 'new', theme: 'pink', visibility: 'public' },
            session: seeded.adminSession,
          });
          expect(u.description).toBe('new');
          expect(u.theme).toBe('pink');
          expect(u.visibility).toBe('public');

          const events = await readEvents(pool, seeded.tenant_id, 'planner.group.updated');
          const payload = events[0]?.payload as { changed_fields: string[] };
          expect(payload.changed_fields).toEqual(
            expect.arrayContaining(['description', 'theme', 'visibility']),
          );
          expect(payload.changed_fields).not.toContain('name');
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
            name: 'ConflictTest',
            session,
          });

          await expect(
            updateGroup({
              group_id: group.id,
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

  it('throws NOT_FOUND for a deleted group', async () => {
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

          await expect(
            updateGroup({
              group_id: crypto.randomUUID(),
              expected_version: 1,
              patch: { name: 'Ghost' },
              session,
            }),
          ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws FORBIDDEN when session lacks planner.group.update', async () => {
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
          const adminSession = seeded.adminSession;

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Protected',
            session: adminSession,
          });

          const viewerSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: crypto.randomUUID(),
            roles: ['planner.viewer'],
          });

          await expect(
            updateGroup({
              group_id: group.id,
              expected_version: 1,
              patch: { name: 'Hacked' },
              session: viewerSession,
            }),
          ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
