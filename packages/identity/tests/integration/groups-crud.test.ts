import { createContributionRegistry, runMigrations, type SessionScope } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  createGroup,
  deleteGroup,
  listGroups,
  setGroupRoles,
  updateGroup,
} from '../../src/index.ts';
import { registerIdentityContributions } from '../../src/register.ts';
import { createTestTenantWithAdmin } from '../../src/testing/index.ts';

const tenantRole = (role_slug: string) => ({
  role_slug,
  scope_kind: 'tenant' as const,
  scope_id: null,
});

describe('groups CRUD', () => {
  it('creates a group, sets roles, lists it', async () => {
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

          const { group_id } = await createGroup(
            { tenant_id, slug: 'hr', name: 'HR', kind: 'default' },
            actor,
          );

          await setGroupRoles(
            {
              group_id,
              tenant_id,
              roles: [tenantRole('people.manager'), tenantRole('hiring.manager')],
            },
            actor,
          );

          const rows = await listGroups(session);
          const hr = rows.find((r) => r.slug === 'hr');
          expect(hr?.roles.map((r) => r.role_slug).sort()).toEqual([
            'hiring.manager',
            'people.manager',
          ]);
          expect(hr?.roles.every((r) => r.scope_kind === 'tenant' && r.scope_id === null)).toBe(
            true,
          );
          expect(hr?.member_count).toBe(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects cross-tenant ops on deleteGroup, setGroupRoles, updateGroup', async () => {
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

          // Tenant A — owns the group
          const { tenant_id: tenantA, admin_user_id: adminA } = await createTestTenantWithAdmin({
            pool,
            slug: 'tenant-a',
            name: 'Tenant A',
            adminEmail: 'admin-a@demo.local',
          });
          // Tenant B — attacker
          const { tenant_id: tenantB, admin_user_id: adminB } = await createTestTenantWithAdmin({
            pool,
            slug: 'tenant-b',
            name: 'Tenant B',
            adminEmail: 'admin-b@demo.local',
          });

          const actorA = { type: 'user' as const, user_id: adminA };
          const actorB = { type: 'user' as const, user_id: adminB };

          const { group_id } = await createGroup(
            { tenant_id: tenantA, slug: 'eng', name: 'Engineering', kind: 'custom' },
            actorA,
          );
          await setGroupRoles(
            { group_id, tenant_id: tenantA, roles: [tenantRole('people.manager')] },
            actorA,
          );

          // deleteGroup: tenant B admin tries to delete tenant A's group
          await expect(deleteGroup({ group_id, tenant_id: tenantB }, actorB)).rejects.toMatchObject(
            { code: 'NOT_FOUND' },
          );

          // setGroupRoles: tenant B admin tries to modify tenant A's group roles
          await expect(
            setGroupRoles({ group_id, tenant_id: tenantB, roles: [] }, actorB),
          ).rejects.toMatchObject({ code: 'NOT_FOUND' });

          // updateGroup: tenant B admin tries to rename tenant A's group
          await expect(
            updateGroup({ group_id, tenant_id: tenantB, name: 'Hijacked' }, actorB),
          ).rejects.toMatchObject({ code: 'NOT_FOUND' });

          // Verify tenant A group is untouched after all rejected attempts
          const sessionA = { user_id: adminA, tenant_id: tenantA } as unknown as SessionScope;
          const rows = await listGroups(sessionA);
          const eng = rows.find((r) => r.group_id === group_id);
          expect(eng).toBeDefined();
          expect(eng?.name).toBe('Engineering');
          expect(eng?.roles).toEqual([tenantRole('people.manager')]);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('writes an org_unit-scoped role and reads it back scoped', async () => {
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

          const orgUnitId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO identity.org_unit_projection (org_unit_id, tenant_id, parent_id, name)
             VALUES ($1, $2, NULL, 'Engineering')`,
            [orgUnitId, tenant_id],
          );

          const { group_id } = await createGroup(
            { tenant_id, slug: 'am', name: 'AM', kind: 'default' },
            actor,
          );

          await setGroupRoles(
            {
              group_id,
              tenant_id,
              roles: [{ role_slug: 'pm.manager', scope_kind: 'org_unit', scope_id: orgUnitId }],
            },
            actor,
          );

          const rows = await listGroups(session);
          const am = rows.find((r) => r.slug === 'am');
          expect(am?.roles).toEqual([
            { role_slug: 'pm.manager', scope_kind: 'org_unit', scope_id: orgUnitId },
          ]);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects setGroupRoles with an unknown org unit', async () => {
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
          const actor = { type: 'user' as const, user_id: admin_user_id };

          const { group_id } = await createGroup(
            { tenant_id, slug: 'am', name: 'AM', kind: 'default' },
            actor,
          );

          await expect(
            setGroupRoles(
              {
                group_id,
                tenant_id,
                roles: [
                  {
                    role_slug: 'pm.manager',
                    scope_kind: 'org_unit',
                    scope_id: crypto.randomUUID(),
                  },
                ],
              },
              actor,
            ),
          ).rejects.toMatchObject({ code: 'unknown_org_unit' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
