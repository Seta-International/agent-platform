import { createContributionRegistry, getSessionScope, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { createUser, ensureGroupViewerGrant, listRoleGrants } from '@seta/identity';
import { registerIdentityContributions } from '@seta/identity/register';
import { closePools, initPools } from '@seta/shared-db';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';

const rbacRegistry = buildRegistry(inventoryToManifests(INVENTORY));
const resolvePerms = async (roles: readonly string[]) =>
  resolvePermissions(rbacRegistry, roles, IMPLICIT_PERMISSIONS);

describe('ensureGroupViewerGrant', () => {
  it('grants group viewer access and rebuilds session scope for the user', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        registerIdentityContributions(reg);
        await runMigrations(reg, { pool });
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
            tenantId,
            'Grant Tenant',
            `grant-${tenantId.slice(0, 8)}`,
          ]);

          const { user_id: userId } = await createUser(
            {
              tenant_id: tenantId,
              email: 'user@test.com',
              name: 'User',
              password: 'ChangeMe@2026',
              initial_role: { role_slug: 'planner.viewer', scope_type: 'tenant', scope_id: null },
            },
            { type: 'cli', user_id: null },
          );
          const groupId = crypto.randomUUID();
          const actorId = crypto.randomUUID();

          const sessionId = `sess-${userId}`;
          await getSessionScope(
            { listRoleGrants, resolvePermissions: resolvePerms },
            sessionId,
            userId,
            'user@test.com',
            'User',
          );

          await ensureGroupViewerGrant({
            tenant_id: tenantId,
            user_id: userId,
            group_id: groupId,
            granted_by: actorId,
          });

          const scope = await getSessionScope(
            { listRoleGrants, resolvePermissions: resolvePerms },
            sessionId,
            userId,
            'user@test.com',
            'User',
          );
          expect(scope.accessible_group_ids).toContain(groupId);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
