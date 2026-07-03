import { createContributionRegistry, runMigrations, type SessionScope } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { identityDb, resetIdentityDb } from '../../src/backend/db/index.ts';
import { accessGroupMembership, personProjection } from '../../src/backend/db/schema.ts';
import { provisionLogin } from '../../src/backend/domain/provision-login.ts';
import { createGroup, listUserGroups, provisionAccount } from '../../src/index.ts';
import { registerIdentityContributions } from '../../src/register.ts';
import { createTestTenantWithAdmin } from '../../src/testing/index.ts';

describe('provision auto-joins Member', () => {
  it('subscriber path (provisionLogin with system actor) joins base group', async () => {
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

          const { tenant_id } = await createTestTenantWithAdmin({ pool });
          const actor = { type: 'system' as const, user_id: null };

          await createGroup(
            { tenant_id, slug: 'member', name: 'Member', kind: 'default', is_base: true },
            actor,
          );

          const { user_id } = await provisionLogin(
            { tenant_id, email: 'subscriber@acme.test', name: 'Sub User' },
            actor,
          );

          const rows = await identityDb()
            .select({ user_id: accessGroupMembership.user_id })
            .from(accessGroupMembership)
            .where(eq(accessGroupMembership.user_id, user_id));

          expect(rows.length).toBeGreaterThan(0);
        } finally {
          resetIdentityDb();
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('fast-path (pre-existing user) still ensures base-group membership', async () => {
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

          const { tenant_id } = await createTestTenantWithAdmin({ pool });
          const actor = { type: 'system' as const, user_id: null };

          await createGroup(
            { tenant_id, slug: 'member', name: 'Member', kind: 'default', is_base: true },
            actor,
          );

          // First call: creates the user
          await provisionLogin(
            { tenant_id, email: 'existing@acme.test', name: 'Existing User' },
            actor,
          );

          // Second call: hits the existing-user fast path
          const { user_id } = await provisionLogin(
            { tenant_id, email: 'existing@acme.test', name: 'Existing User' },
            actor,
          );

          const rows = await identityDb()
            .select({ user_id: accessGroupMembership.user_id })
            .from(accessGroupMembership)
            .where(eq(accessGroupMembership.user_id, user_id));

          expect(rows.length).toBeGreaterThan(0);
        } finally {
          resetIdentityDb();
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('adds a newly provisioned user to the base group', async () => {
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
          const session = { user_id: admin_user_id, tenant_id } as unknown as SessionScope;
          const actor = { type: 'user' as const, user_id: admin_user_id };

          await createGroup(
            { tenant_id, slug: 'member', name: 'Member', kind: 'default', is_base: true },
            actor,
          );

          const personId = crypto.randomUUID();
          await identityDb().insert(personProjection).values({
            person_id: personId,
            tenant_id,
            full_name: 'New Hire',
            work_email: 'new@acme.test',
          });

          const { user_id } = await provisionAccount(session, { person_id: personId });

          const groups = await listUserGroups(session, user_id);
          expect(groups.map((g) => g.slug)).toContain('member');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
