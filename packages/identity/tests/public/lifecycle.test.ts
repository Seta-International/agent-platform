import { createContributionRegistry, runMigrations } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { registerCoreContributions } from '@seta/core/register';
import {
  createUser,
  deactivateUser,
  grantRole,
  IdentityError,
  listRoleGrants,
  listUsers,
  reactivateUser,
  revokeRole,
  updateUserProfile,
} from '@seta/identity';
import { registerIdentityContributions } from '@seta/identity/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';

describe('@seta/identity public-surface lifecycle', () => {
  it('createUser → grantRole → listRoleGrants → updateProfile → revokeRole → deactivate → reactivate', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
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
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Demo', 'demo')`,
            [tenantId],
          );

          const { user_id: adminId } = await createUser(
            {
              tenant_id: tenantId,
              email: 'admin@d.local',
              name: 'Admin',
              password: 'admin-password-1234',
              initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
            },
            { type: 'cli', user_id: null },
          );

          const { user_id: bobId } = await createUser(
            {
              tenant_id: tenantId,
              email: 'bob@d.local',
              name: 'Bob',
              password: 'bob-password-1234',
            },
            { type: 'cli', user_id: null },
          );

          const { grant_id } = await grantRole(
            {
              user_id: bobId,
              tenant_id: tenantId,
              role_slug: 'planner.contributor',
              scope_type: 'tenant',
              scope_id: null,
            },
            { type: 'user', user_id: adminId },
          );

          const grants = await listRoleGrants(bobId);
          expect(grants.tenant_id).toBe(tenantId);
          expect(grants.grants.map((g) => g.role_slug)).toEqual(['planner.contributor']);

          const updated = await updateUserProfile(
            bobId,
            { skills: ['rust', 'Rust', 'TypeScript'] },
            { type: 'user', user_id: bobId },
          );
          expect(updated.skills).toEqual(['rust', 'typescript']);

          await revokeRole(grant_id, { type: 'user', user_id: adminId });
          const afterRevoke = await listRoleGrants(bobId);
          expect(afterRevoke.grants).toEqual([]);

          await deactivateUser(bobId, { type: 'user', user_id: adminId });
          await reactivateUser(bobId, { type: 'user', user_id: adminId });

          const listing = await listUsers(tenantId, { limit: 10, offset: 0 });
          expect(listing.total).toBe(2);

          const events = (
            await pool.query(
              `SELECT event_type, count(*)::int AS n FROM core.events GROUP BY event_type ORDER BY event_type`,
            )
          ).rows;
          expect(events.map((r: { event_type: string }) => r.event_type)).toEqual(
            expect.arrayContaining([
              'identity.user.created',
              'identity.role_grant.changed',
              'identity.user.profile.updated',
              'identity.user.deactivated',
            ]),
          );
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('refuses to deactivate the last active org.admin', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
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
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Demo', 'demo')`,
            [tenantId],
          );
          const { user_id } = await createUser(
            {
              tenant_id: tenantId,
              email: 'a@d.local',
              name: 'A',
              password: 'admin-password-1234',
              initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
            },
            { type: 'cli', user_id: null },
          );
          await expect(deactivateUser(user_id, { type: 'cli', user_id: null })).rejects.toSatisfy(
            (e: unknown) => e instanceof IdentityError && e.code === 'LAST_ORG_ADMIN',
          );
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
