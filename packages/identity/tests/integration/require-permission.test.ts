import { createContributionRegistry, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../src/backend/domain/create-user.ts';
import { IdentityError, requirePermission } from '../../src/backend/rbac.ts';
import { registerIdentityContributions } from '../../src/register.ts';
import { createTestTenantWithAdmin } from '../../src/testing/index.ts';

const CLI = { type: 'cli' as const, user_id: null };

describe('requirePermission', () => {
  it('allows a fine-grained role (identity.admin) the permissions its role grants', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
          // fallback) — this only opens the executor context identityDb() requires.
          await scoped(crypto.randomUUID(), async () => {
            const reg = createContributionRegistry();
            registerCoreContributions(reg);
            registerIdentityContributions(reg);
            await runMigrations(reg, { pool });

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

            // identity.admin grants identity.user.update per INVENTORY. The old
            // hasPermission stub only allowed org.admin/tenant.admin and would
            // have DENIED this.
            await expect(
              requirePermission(user_id, 'identity.user.update', tenant_id),
            ).resolves.toBeUndefined();
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('denies a privileged permission to a user holding no relevant role', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
          // fallback) — this only opens the executor context identityDb() requires.
          await scoped(crypto.randomUUID(), async () => {
            const reg = createContributionRegistry();
            registerCoreContributions(reg);
            registerIdentityContributions(reg);
            await runMigrations(reg, { pool });

            const { tenant_id } = await createTestTenantWithAdmin({ pool });
            const { user_id } = await createUser(
              {
                tenant_id,
                email: 'plain@demo.local',
                name: 'Plain User',
                password: 'pw',
              },
              CLI,
            );

            await expect(
              requirePermission(user_id, 'identity.user.update', tenant_id),
            ).rejects.toBeInstanceOf(IdentityError);
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
