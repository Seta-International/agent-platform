import { createContributionRegistry, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { identityDb } from '../../src/backend/db/index.ts';
import { rolePermissionOverlays } from '../../src/backend/db/schema.ts';
import { createUser } from '../../src/backend/domain/create-user.ts';
import { requirePermission } from '../../src/backend/rbac.ts';
import { registerIdentityContributions } from '../../src/register.ts';
import { createTestTenantWithAdmin } from '../../src/testing/index.ts';

const CLI = { type: 'cli' as const, user_id: null };

function withDb(fn: (ctx: { pool: import('pg').Pool }) => Promise<void>): Promise<void> {
  return withTestDb(
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
        await scoped(crypto.randomUUID(), () => fn({ pool }));
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );
}

describe('overlay honored in requirePermission', () => {
  it('honors a tenant overlay revoke', async () => {
    await withDb(async ({ pool }) => {
      const { tenant_id } = await createTestTenantWithAdmin({ pool });
      const { user_id } = await createUser(
        {
          tenant_id,
          email: 'viewer@demo.local',
          name: 'Viewer',
          password: 'pw',
          initial_role: { role_slug: 'identity.viewer', scope_type: 'tenant', scope_id: null },
        },
        CLI,
      );

      await expect(
        requirePermission(user_id, 'identity.user.list', tenant_id),
      ).resolves.toBeUndefined();

      await identityDb().insert(rolePermissionOverlays).values({
        tenant_id,
        role_slug: 'identity.viewer',
        permission_key: 'identity.user.list',
        effect: 'revoke',
      });

      await expect(requirePermission(user_id, 'identity.user.list', tenant_id)).rejects.toThrow(
        /FORBIDDEN|Missing permission/,
      );
    });
  });

  it('honors a tenant overlay grant', async () => {
    await withDb(async ({ pool }) => {
      const { tenant_id } = await createTestTenantWithAdmin({ pool });
      const { user_id } = await createUser(
        {
          tenant_id,
          email: 'viewer2@demo.local',
          name: 'Viewer2',
          password: 'pw',
          initial_role: { role_slug: 'identity.viewer', scope_type: 'tenant', scope_id: null },
        },
        CLI,
      );

      await expect(requirePermission(user_id, 'identity.user.update', tenant_id)).rejects.toThrow(
        /FORBIDDEN|Missing permission/,
      );

      await identityDb().insert(rolePermissionOverlays).values({
        tenant_id,
        role_slug: 'identity.viewer',
        permission_key: 'identity.user.update',
        effect: 'grant',
      });

      await expect(
        requirePermission(user_id, 'identity.user.update', tenant_id),
      ).resolves.toBeUndefined();
    });
  });
});
