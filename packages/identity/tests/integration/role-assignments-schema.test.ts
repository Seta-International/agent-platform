import { createContributionRegistry, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { identityDb } from '../../src/backend/db/index.ts';
import { accessGroup, accessGroupRole, roleAssignments } from '../../src/backend/db/schema.ts';
import { registerIdentityContributions } from '../../src/register.ts';
import { createTestTenantWithAdmin } from '../../src/testing/index.ts';

describe('role_assignments schema', () => {
  it('stores org_unit-scoped assignments and rejects duplicates', async () => {
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

            const { tenant_id: tenantId } = await createTestTenantWithAdmin({ pool });
            const userId = crypto.randomUUID();
            await pool.query(
              `INSERT INTO identity."user" (id, tenant_id, email, name, email_verified) VALUES ($1, $2, $3, $4, true)`,
              [userId, tenantId, `u-${userId}@demo.local`, 'Scoped User'],
            );
            const orgUnitId = crypto.randomUUID();

            const db = identityDb();
            const row = {
              user_id: userId,
              tenant_id: tenantId,
              role_slug: 'pm.manager',
              scope_kind: 'org_unit' as const,
              scope_id: orgUnitId,
            };
            await db.insert(roleAssignments).values(row);
            // drizzle wraps the pg error; the unique violation surfaces as pg code 23505 on the cause.
            const dup = await db
              .insert(roleAssignments)
              .values(row)
              .then(
                () => null,
                (e: { cause?: { code?: string } }) => e,
              );
            expect(dup?.cause?.code).toBe('23505');
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('access_group_role carries scope', async () => {
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

            const { tenant_id: tenantId } = await createTestTenantWithAdmin({ pool });
            const orgUnitId = crypto.randomUUID();
            const groupId = crypto.randomUUID();
            await identityDb().insert(accessGroup).values({
              id: groupId,
              tenant_id: tenantId,
              slug: 'scoped-group',
              name: 'Scoped Group',
              kind: 'custom',
            });

            await identityDb().insert(accessGroupRole).values({
              tenant_id: tenantId,
              group_id: groupId,
              role_slug: 'pm.manager',
              scope_kind: 'org_unit',
              scope_id: orgUnitId,
            });
            const [r] = await identityDb()
              .select()
              .from(accessGroupRole)
              .where(eq(accessGroupRole.group_id, groupId));
            expect(r?.scope_kind).toBe('org_unit');
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
