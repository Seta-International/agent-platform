import { createContributionRegistry, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { identityDb } from '../../src/backend/db/index.ts';
import { productGrant, roleGrants } from '../../src/backend/db/schema.ts';
import { resolveProductAccess } from '../../src/index.ts';
import { registerIdentityContributions } from '../../src/register.ts';
import { createTestTenantWithAdmin } from '../../src/testing/index.ts';

describe('resolveProductAccess', () => {
  it('derives products from role namespaces, gated by tenant enablement', async () => {
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

          const { tenant_id: tenantId, admin_user_id: userId } = await createTestTenantWithAdmin({
            pool,
          });

          const db = identityDb();
          // tenant has people + pm
          await db.insert(productGrant).values([
            {
              tenant_id: tenantId,
              subject_type: 'tenant',
              subject_id: tenantId,
              product_id: 'people',
              effect: 'grant',
            },
            {
              tenant_id: tenantId,
              subject_type: 'tenant',
              subject_id: tenantId,
              product_id: 'pm',
              effect: 'grant',
            },
          ]);
          // user holds a pm role (implies pm) and a hiring role (NOT tenant-enabled)
          await db.insert(roleGrants).values([
            {
              user_id: userId,
              tenant_id: tenantId,
              role_slug: 'pm.pmo',
              scope_type: 'tenant',
              scope_id: null,
              granted_via: 'admin',
            },
            {
              user_id: userId,
              tenant_id: tenantId,
              role_slug: 'hiring.recruiter',
              scope_type: 'tenant',
              scope_id: null,
              granted_via: 'admin',
            },
          ]);

          const access = await resolveProductAccess(userId, tenantId, []);
          // hiring excluded (tenant lacks it), people not role-derived
          expect([...access].sort()).toEqual(['pm']);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('honours explicit user grant and revoke', async () => {
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

          const { tenant_id: tenantId, admin_user_id: userId } = await createTestTenantWithAdmin({
            pool,
          });

          const db = identityDb();
          await db.insert(productGrant).values([
            {
              tenant_id: tenantId,
              subject_type: 'tenant',
              subject_id: tenantId,
              product_id: 'people',
              effect: 'grant',
            },
            {
              tenant_id: tenantId,
              subject_type: 'user',
              subject_id: userId,
              product_id: 'people',
              effect: 'grant',
            },
          ]);

          expect([...(await resolveProductAccess(userId, tenantId, []))]).toEqual(['people']);

          // unique index (subject_type, subject_id, product_id) — update instead of insert
          await db
            .update(productGrant)
            .set({ effect: 'revoke' })
            .where(
              and(
                eq(productGrant.subject_type, 'user'),
                eq(productGrant.subject_id, userId),
                eq(productGrant.product_id, 'people'),
              ),
            );

          expect([...(await resolveProductAccess(userId, tenantId, []))]).toEqual([]);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
