import { createContributionRegistry, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../../src/backend/domain/create-user.ts';
import { grantRole } from '../../../src/backend/domain/grant-role.ts';
import { listTenantAdminUserIds } from '../../../src/backend/domain/list-tenant-admins.ts';
import { revokeRole } from '../../../src/backend/domain/revoke-role.ts';
import { registerIdentityContributions } from '../../../src/register.ts';

describe('listTenantAdminUserIds', () => {
  it('returns only active org.admin user ids in the tenant', async () => {
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

          const tenantId = crypto.randomUUID();
          const otherTenantId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Demo', 'demo'), ($2, 'Other', 'other')`,
            [tenantId, otherTenantId],
          );

          // userA: org.admin in the tenant — should be returned.
          const { user_id: userA } = await createUser(
            {
              tenant_id: tenantId,
              email: 'admin@d.local',
              name: 'Admin A',
              password: 'ChangeMe@2026',
              initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
            },
            { type: 'cli', user_id: null },
          );

          // userB: only a viewer role in the tenant — should NOT be returned.
          const { user_id: userB } = await createUser(
            {
              tenant_id: tenantId,
              email: 'viewer@d.local',
              name: 'Viewer B',
              password: 'ChangeMe@2026',
              initial_role: { role_slug: 'planner.viewer', scope_type: 'tenant', scope_id: null },
            },
            { type: 'cli', user_id: null },
          );

          // userC: org.admin but grant revoked — should NOT be returned.
          const { user_id: userC } = await createUser(
            {
              tenant_id: tenantId,
              email: 'former@d.local',
              name: 'Former C',
              password: 'ChangeMe@2026',
            },
            { type: 'cli', user_id: null },
          );
          const { grant_id: cGrant } = await grantRole(
            {
              user_id: userC,
              tenant_id: tenantId,
              role_slug: 'org.admin',
              scope_type: 'tenant',
              scope_id: null,
            },
            { type: 'cli', user_id: null },
          );
          await revokeRole(cGrant, { type: 'cli', user_id: null });

          // userD: org.admin in a DIFFERENT tenant — should NOT be returned.
          await createUser(
            {
              tenant_id: otherTenantId,
              email: 'admin@other.local',
              name: 'Admin D',
              password: 'ChangeMe@2026',
              initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
            },
            { type: 'cli', user_id: null },
          );

          const ids = await listTenantAdminUserIds(tenantId);
          expect(ids).toEqual([userA]);
          expect(ids).not.toContain(userB);
          expect(ids).not.toContain(userC);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
