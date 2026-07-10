import { createContributionRegistry, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools, scoped } from '@seta/shared-db';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../src/backend/domain/create-user.ts';
import { listMyEffectivePermissions } from '../../src/index.ts';
import { registerIdentityContributions } from '../../src/register.ts';
import { createTestTenantWithAdmin } from '../../src/testing/index.ts';

const registry = buildRegistry(inventoryToManifests(INVENTORY));
const CLI = { type: 'cli' as const, user_id: null };

describe('listMyEffectivePermissions', () => {
  it('resolves org.admin to the full wildcard permission set', async () => {
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
          // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
          // fallback) — this only opens the executor context identityDb() requires.
          await scoped(crypto.randomUUID(), async () => {
            const { admin_user_id } = await createTestTenantWithAdmin({ pool });
            const perms = await listMyEffectivePermissions({
              user_id: admin_user_id,
              type: 'user',
            });
            // org.admin is WILDCARD -> every permission key in the registry.
            expect(perms).toEqual([...registry.allPermissions].sort());
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('resolves a fine-grained role (identity.admin) to its INVENTORY perms ∪ IMPLICIT', async () => {
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
          // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
          // fallback) — this only opens the executor context identityDb() requires.
          await scoped(crypto.randomUUID(), async () => {
            const { tenant_id } = await createTestTenantWithAdmin({ pool });
            const { user_id } = await createUser(
              {
                tenant_id,
                email: 'idadmin@demo.local',
                name: 'Identity Admin',
                password: 'pw',
                initial_role: {
                  role_slug: 'identity.admin',
                  scope_type: 'tenant',
                  scope_id: null,
                },
              },
              CLI,
            );
            const perms = await listMyEffectivePermissions({ user_id, type: 'user' });
            const expected = [
              ...resolvePermissions(registry, ['identity.admin'], IMPLICIT_PERMISSIONS),
            ].sort();
            expect(perms).toEqual(expected);
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('resolves org.viewer to all .read permissions plus IMPLICIT', async () => {
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
          // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
          // fallback) — this only opens the executor context identityDb() requires.
          await scoped(crypto.randomUUID(), async () => {
            const { tenant_id } = await createTestTenantWithAdmin({ pool });
            const { user_id } = await createUser(
              {
                tenant_id,
                email: 'viewer@demo.local',
                name: 'Org Viewer',
                password: 'pw',
                initial_role: {
                  role_slug: 'org.viewer',
                  scope_type: 'tenant',
                  scope_id: null,
                },
              },
              CLI,
            );
            const perms = await listMyEffectivePermissions({ user_id, type: 'user' });
            const expected = [
              ...resolvePermissions(registry, ['org.viewer'], IMPLICIT_PERMISSIONS),
            ].sort();
            expect(perms).toEqual(expected);
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns [] for a non-user actor', async () => {
    expect(await listMyEffectivePermissions({ user_id: null, type: 'cli' })).toEqual([]);
  });
});
