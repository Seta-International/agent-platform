import { createContributionRegistry, getSessionScope, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { bulkGrantRole, bulkRevokeRole } from '../../src/backend/domain/bulk-grant-role.ts';
import { grantRole } from '../../src/backend/domain/grant-role.ts';
import { listRoleAssignments } from '../../src/backend/domain/list-role-assignments.ts';
import { revokeRole } from '../../src/backend/domain/revoke-role.ts';
import { registerIdentityContributions } from '../../src/register.ts';
import { seedTenantWithUsers } from '../helpers/seed-tenant.ts';

// FUT-377: a session already resolved for a user must reflect direct role grants/revokes made
// after it was built, without waiting for the 15-minute hot-cache TTL. grantRole/revokeRole/
// bulkGrantRole/bulkRevokeRole now call invalidateUserSessions to force a fresh resolve on the
// next read, matching the pattern group-membership.ts already uses for group-based grants.
// (Tenant-wide role-permission overlay changes are invalidated separately, via the
// `apps/server` refresh-role-overlay subscriber — out of scope here.)

function withDb<T>(fn: (pool: import('pg').Pool) => Promise<T>): Promise<T> {
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
        return await fn(pool);
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );
}

const resolveEmpty = { listRoleAssignments, resolvePermissions: async () => new Set<string>() };

describe('session invalidation on role changes', () => {
  it('grantRole / revokeRole invalidate the target user session immediately', async () => {
    await withDb(async (pool) => {
      const { tenant_id, admin, users } = await seedTenantWithUsers(pool, 1);
      const targetId = users[0]!;
      const sessionId = `test-session-${crypto.randomUUID()}`;

      const before = await getSessionScope(resolveEmpty, sessionId, targetId, 'u0@d.local', 'U0');
      expect(before.role_summary.roles).toEqual([]);

      const { grant_id } = await grantRole(
        {
          user_id: targetId,
          tenant_id,
          role_slug: 'hiring.viewer',
          scope_kind: 'tenant',
          scope_id: null,
        },
        { type: 'user', user_id: admin },
      );

      const afterGrant = await getSessionScope(
        resolveEmpty,
        sessionId,
        targetId,
        'u0@d.local',
        'U0',
      );
      expect(afterGrant.role_summary.roles).toEqual(['hiring.viewer']);

      await revokeRole(grant_id, { type: 'user', user_id: admin });

      const afterRevoke = await getSessionScope(
        resolveEmpty,
        sessionId,
        targetId,
        'u0@d.local',
        'U0',
      );
      expect(afterRevoke.role_summary.roles).toEqual([]);
    });
  });

  it('bulkGrantRole / bulkRevokeRole invalidate every affected user session immediately', async () => {
    await withDb(async (pool) => {
      const { tenant_id, admin, users } = await seedTenantWithUsers(pool, 2);
      const sessionIds = users.map(() => `test-session-${crypto.randomUUID()}`);

      for (let i = 0; i < users.length; i++) {
        const scope = await getSessionScope(
          resolveEmpty,
          sessionIds[i]!,
          users[i]!,
          'u@d.local',
          'U',
        );
        expect(scope.role_summary.roles).toEqual([]);
      }

      await bulkGrantRole(
        {
          user_ids: users,
          tenant_id,
          role_slug: 'hiring.viewer',
          scope_kind: 'tenant',
          scope_id: null,
        },
        { type: 'user', user_id: admin },
      );

      for (let i = 0; i < users.length; i++) {
        const scope = await getSessionScope(
          resolveEmpty,
          sessionIds[i]!,
          users[i]!,
          'u@d.local',
          'U',
        );
        expect(scope.role_summary.roles).toEqual(['hiring.viewer']);
      }

      await bulkRevokeRole(
        {
          user_ids: users,
          tenant_id,
          role_slug: 'hiring.viewer',
          scope_kind: 'tenant',
          scope_id: null,
        },
        { type: 'user', user_id: admin },
      );

      for (let i = 0; i < users.length; i++) {
        const scope = await getSessionScope(
          resolveEmpty,
          sessionIds[i]!,
          users[i]!,
          'u@d.local',
          'U',
        );
        expect(scope.role_summary.roles).toEqual([]);
      }
    });
  });
});
