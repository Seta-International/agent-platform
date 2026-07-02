// packages/identity/tests/integration/product-gate-e2e.test.ts
//
// Proves that the real identity resolveProductAccess drives the product-gate
// inside getSessionScope — exactly the wiring build.ts now uses.
// Tests the SAME dep composition as the composition root:
//   listRoleGrants + listUserGroupIds + resolveProductAccess (all real, from @seta/identity)
//   resolvePermissions: faithful stub returning pm.account.read for pm.pmo holders.
import { createContributionRegistry, getSessionScope, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { _clearHotForTest, resetCoreDb } from '@seta/core/testing';
import { listRoleGrants, listUserGroupIds, resolveProductAccess } from '@seta/identity';
import { registerIdentityContributions } from '@seta/identity/register';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { identityDb } from '../../src/backend/db/index.ts';
import { productGrant, roleAssignments } from '../../src/backend/db/schema.ts';

describe('product gate e2e', () => {
  it('hides pm permissions until tenant enables pm product', async () => {
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
          _clearHotForTest();

          const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
          const db = identityDb();

          // Grant the admin user the pm.pmo role (in addition to org.admin from bootstrap)
          await db.insert(roleAssignments).values({
            user_id: admin_user_id,
            tenant_id,
            role_slug: 'pm.pmo',
            scope_kind: 'tenant',
            scope_id: null,
            granted_via: 'admin',
          });

          const sessionId = `sess-pg-e2e-${crypto.randomUUID()}`;

          // Faithful resolvePermissions stub: returns pm.account.read when pm.pmo in roles.
          // The component under test is resolveProductAccess + the gate, not this resolver.
          const resolvePermissions = async (
            roles: readonly string[],
          ): Promise<ReadonlySet<string>> =>
            new Set(roles.includes('pm.pmo') ? ['pm.account.read'] : []);

          const deps = {
            listRoleGrants,
            resolvePermissions,
            resolveGroupIds: listUserGroupIds,
            resolveProductAccess,
          };

          // Scenario 1: tenant has NO product_grant for pm.
          // The gate should strip pm.account.read and product_access should be empty.
          const scope1 = await getSessionScope(
            deps,
            sessionId,
            admin_user_id,
            'admin@demo.local',
            'Admin',
          );
          expect(scope1.permissions.has('pm.account.read')).toBe(false);
          expect([...scope1.product_access]).toEqual([]);

          // Insert a tenant-scope product_grant for pm.
          await db.insert(productGrant).values({
            tenant_id,
            subject_type: 'tenant',
            subject_id: tenant_id,
            product_id: 'pm',
            effect: 'grant',
          });

          // Clear the hot cache so the DB-hydration path recomputes product_access.
          _clearHotForTest();

          // Scenario 2: pm product_grant now exists.
          // The gate should pass pm.account.read through and product_access should contain 'pm'.
          const scope2 = await getSessionScope(
            deps,
            sessionId,
            admin_user_id,
            'admin@demo.local',
            'Admin',
          );
          expect(scope2.permissions.has('pm.account.read')).toBe(true);
          expect(scope2.product_access.has('pm')).toBe(true);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
