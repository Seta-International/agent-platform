import { createContributionRegistry, runMigrations, type SessionScope } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  addGroupMembers,
  createGroup,
  createUser,
  listGroupMembers,
  listUserGroups,
  removeGroupMember,
} from '../../src/index.ts';
import { registerIdentityContributions } from '../../src/register.ts';
import { createTestTenantWithAdmin } from '../../src/testing/index.ts';

describe('group membership', () => {
  it('adds and removes members, lists a user groups, invalidates session', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const reg = createContributionRegistry();
          registerCoreContributions(reg);
          registerIdentityContributions(reg);
          await runMigrations(reg, { pool });

          const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });

          const session = { user_id: admin_user_id, tenant_id } as unknown as SessionScope;
          const actor = { type: 'user' as const, user_id: admin_user_id };

          const { user_id: targetUserId } = await createUser(
            {
              tenant_id,
              email: 'target@example.com',
              name: 'Target User',
              password: 'TestPassword123!',
              initial_role: { role_slug: 'org.viewer', scope_type: 'tenant', scope_id: null },
            },
            actor,
          );

          const { group_id } = await createGroup(
            { tenant_id, slug: 'pmo', name: 'PMO', kind: 'default' },
            actor,
          );

          await addGroupMembers({ group_id, tenant_id, user_ids: [targetUserId] }, actor);
          expect(await listUserGroups(session, targetUserId)).toEqual([
            { group_id, slug: 'pmo', name: 'PMO' },
          ]);

          await removeGroupMember({ group_id, tenant_id, user_id: targetUserId }, actor);
          expect(await listUserGroups(session, targetUserId)).toEqual([]);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('listGroupMembers does not leak across tenants', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const reg = createContributionRegistry();
          registerCoreContributions(reg);
          registerIdentityContributions(reg);
          await runMigrations(reg, { pool });

          // Tenant A
          const { tenant_id: tenantA, admin_user_id: adminA } = await createTestTenantWithAdmin({
            pool,
            slug: 'tenant-a-list',
            name: 'Tenant A List',
            adminEmail: 'admin-a-list@example.com',
          });
          // Tenant B
          const { tenant_id: tenantB, admin_user_id: adminB } = await createTestTenantWithAdmin({
            pool,
            slug: 'tenant-b-list',
            name: 'Tenant B List',
            adminEmail: 'admin-b-list@example.com',
          });

          const actorA = { type: 'user' as const, user_id: adminA };
          const actorB = { type: 'user' as const, user_id: adminB };
          const sessionA = { user_id: adminA, tenant_id: tenantA } as unknown as SessionScope;

          // Create a group in tenant B and add its admin as a member
          const { group_id: groupB } = await createGroup(
            { tenant_id: tenantB, slug: 'eng', name: 'Engineering', kind: 'default' },
            actorB,
          );
          await addGroupMembers(
            { group_id: groupB, tenant_id: tenantB, user_ids: [adminB] },
            actorB,
          );

          // Tenant A session must not see tenant B's group members
          const leaked = await listGroupMembers(sessionA, groupB);
          expect(leaked).toEqual([]);

          // Sanity: tenant B session sees its own members
          const sessionB = { user_id: adminB, tenant_id: tenantB } as unknown as SessionScope;
          const members = await listGroupMembers(sessionB, groupB);
          expect(members).toEqual([{ user_id: adminB }]);

          // Create a same-tenant group for actorA and verify addGroupMembers still works
          const { group_id: groupA } = await createGroup(
            { tenant_id: tenantA, slug: 'pmo', name: 'PMO', kind: 'default' },
            actorA,
          );
          await expect(
            addGroupMembers({ group_id: groupA, tenant_id: tenantA, user_ids: [adminA] }, actorA),
          ).resolves.toBeUndefined();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('addGroupMembers and removeGroupMember reject cross-tenant group_id', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const reg = createContributionRegistry();
          registerCoreContributions(reg);
          registerIdentityContributions(reg);
          await runMigrations(reg, { pool });

          const { tenant_id: tenantA, admin_user_id: adminA } = await createTestTenantWithAdmin({
            pool,
            slug: 'tenant-a-write',
            name: 'Tenant A Write',
            adminEmail: 'admin-a-write@example.com',
          });
          const { tenant_id: tenantB, admin_user_id: adminB } = await createTestTenantWithAdmin({
            pool,
            slug: 'tenant-b-write',
            name: 'Tenant B Write',
            adminEmail: 'admin-b-write@example.com',
          });

          const actorB = { type: 'user' as const, user_id: adminB };
          const { group_id: groupB } = await createGroup(
            { tenant_id: tenantB, slug: 'sec', name: 'Security', kind: 'default' },
            actorB,
          );

          // actorA (system actor to bypass permission check) tries to write to tenant B's group
          const systemActorA = { type: 'cli' as const, user_id: null };

          await expect(
            addGroupMembers(
              { group_id: groupB, tenant_id: tenantA, user_ids: [adminA] },
              systemActorA,
            ),
          ).rejects.toMatchObject({ code: 'NOT_FOUND' });

          await expect(
            removeGroupMember(
              { group_id: groupB, tenant_id: tenantA, user_id: adminA },
              systemActorA,
            ),
          ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
