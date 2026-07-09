import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { requirePermission } from '../../src/backend/rbac.ts';
import { addGroupMember, createGroup, isGroupMember, listMemberGroupIds } from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

describe('requirePermission group gate reads planner-local membership', () => {
  it('planner.member with a group_members row passes for that group, fails for another', async () => {
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
            users: [{ name: 'Mona', email: 'mona@example.test' }],
          });

          // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
          // fallback) — this only opens the executor context plannerDb() requires.
          await scoped(seeded.tenant_id, async () => {
            const [mona] = seeded.users;
            if (!mona) throw new Error('Seed did not create Mona');

            const groupA = await createGroup({
              tenant_id: seeded.tenant_id,
              name: 'Group A',
              session: seeded.adminSession,
            });
            const groupB = await createGroup({
              tenant_id: seeded.tenant_id,
              name: 'Group B',
              session: seeded.adminSession,
            });

            await addGroupMember({
              group_id: groupA.id,
              user_id: mona.user_id,
              session: seeded.adminSession,
            });

            const monaSession = buildSession({
              tenant_id: seeded.tenant_id,
              user_id: mona.user_id,
              email: mona.email,
              display_name: mona.name,
              roles: ['planner.member'],
            });

            await expect(
              requirePermission(monaSession, 'planner.task.read', groupA.id),
            ).resolves.toBeUndefined();

            await expect(
              requirePermission(monaSession, 'planner.task.read', groupB.id),
            ).rejects.toMatchObject({ code: 'FORBIDDEN' });
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('org.admin (wildcard) passes group-scoped checks everywhere, without a membership row', async () => {
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

          // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
          // fallback) — this only opens the executor context plannerDb() requires.
          await scoped(seeded.tenant_id, async () => {
            const group = await createGroup({
              tenant_id: seeded.tenant_id,
              name: 'Group C',
              session: seeded.adminSession,
            });

            await expect(
              requirePermission(seeded.adminSession, 'planner.task.read', group.id),
            ).resolves.toBeUndefined();
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('non-member with the permission still fails a group-scoped call: membership grants reach, not permissions', async () => {
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
            users: [{ name: 'Nora', email: 'nora@example.test' }],
          });

          // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
          // fallback) — this only opens the executor context plannerDb() requires.
          await scoped(seeded.tenant_id, async () => {
            const [nora] = seeded.users;
            if (!nora) throw new Error('Seed did not create Nora');

            const group = await createGroup({
              tenant_id: seeded.tenant_id,
              name: 'Group D',
              session: seeded.adminSession,
            });

            // Nora carries planner.member (has planner.task.read) but was never added to the group.
            const noraSession = buildSession({
              tenant_id: seeded.tenant_id,
              user_id: nora.user_id,
              email: nora.email,
              display_name: nora.name,
              roles: ['planner.member'],
            });

            await expect(
              requirePermission(noraSession, 'planner.task.read', group.id),
            ).rejects.toMatchObject({ code: 'FORBIDDEN' });
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('isGroupMember and listMemberGroupIds reflect planner.group_members directly', async () => {
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
            users: [{ name: 'Omar', email: 'omar@example.test' }],
          });

          // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
          // fallback) — this only opens the executor context plannerDb() requires.
          await scoped(seeded.tenant_id, async () => {
            const [omar] = seeded.users;
            if (!omar) throw new Error('Seed did not create Omar');

            const groupA = await createGroup({
              tenant_id: seeded.tenant_id,
              name: 'Group E',
              session: seeded.adminSession,
            });
            const groupB = await createGroup({
              tenant_id: seeded.tenant_id,
              name: 'Group F',
              session: seeded.adminSession,
            });

            await addGroupMember({
              group_id: groupA.id,
              user_id: omar.user_id,
              session: seeded.adminSession,
            });

            await expect(isGroupMember(omar.user_id, groupA.id)).resolves.toBe(true);
            await expect(isGroupMember(omar.user_id, groupB.id)).resolves.toBe(false);

            const memberGroupIds = await listMemberGroupIds(omar.user_id, seeded.tenant_id);
            expect(memberGroupIds).toEqual([groupA.id]);
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
