import { createContributionRegistry, runMigrations, type SessionScope } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { grantProductAccess, listProductAccess, resolveProductAccess } from '../../src/index.ts';
import { registerIdentityContributions } from '../../src/register.ts';
import { createTestTenantWithAdmin } from '../../src/testing/index.ts';

describe('grantProductAccess', () => {
  it('enables a product for the tenant and surfaces it through resolution', async () => {
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

          // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
          // fallback) — this only opens the executor context identityDb() requires.
          await scoped(tenant_id, async () => {
            await grantProductAccess(
              {
                tenant_id,
                subject_type: 'tenant',
                subject_id: tenant_id,
                product_id: 'people',
                effect: 'grant',
              },
              actor,
            );
            await grantProductAccess(
              {
                tenant_id,
                subject_type: 'user',
                subject_id: admin_user_id,
                product_id: 'people',
                effect: 'grant',
              },
              actor,
            );
            expect([...(await resolveProductAccess(admin_user_id, tenant_id, []))]).toEqual([
              'people',
            ]);

            // upsert: revoke updates the existing row (no unique-violation)
            await grantProductAccess(
              {
                tenant_id,
                subject_type: 'user',
                subject_id: admin_user_id,
                product_id: 'people',
                effect: 'revoke',
              },
              actor,
            );
            expect([...(await resolveProductAccess(admin_user_id, tenant_id, []))]).toEqual([]);
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('listProductAccess returns tenant-scope entry', async () => {
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

          // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
          // fallback) — this only opens the executor context identityDb() requires.
          await scoped(tenant_id, async () => {
            await grantProductAccess(
              {
                tenant_id,
                subject_type: 'tenant',
                subject_id: tenant_id,
                product_id: 'people',
                effect: 'grant',
              },
              actor,
            );

            // org.admin wildcard covers identity.product_access.read
            const adminSession = {
              user_id: admin_user_id,
              tenant_id,
              permissions: new Set(['identity.product_access.read']),
            } as unknown as SessionScope;

            const entries = await listProductAccess(adminSession, admin_user_id);
            expect(entries).toContainEqual({
              product_id: 'people',
              source: 'tenant',
              effect: 'grant',
            });
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
