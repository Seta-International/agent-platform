// packages/core/tests/integration/feature-flag-admin.test.ts
import { createUser, listRoleGrants } from '@seta/identity';
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
import { afterEach, describe, expect, it } from 'vitest';
import { resetCoreDb } from '../../src/db/client.ts';
import { FlagError } from '../../src/flags/apply-feature-flag.ts';
import { resetFlagCache } from '../../src/flags/cache.ts';
import { setFlagCatalog } from '../../src/flags/catalog.ts';
import { listFeatureFlags } from '../../src/flags/list.ts';
import { setFeatureFlag } from '../../src/flags/set-feature-flag.ts';
import { createContributionRegistry, getSessionScope, runMigrations } from '../../src/index.ts';
import { registerCoreContributions } from '../../src/register.ts';
import { _clearHotForTest } from '../../src/session/scope.ts';

afterEach(async () => {
  resetCoreDb();
  await closePools();
});

describe('feature flag admin surface', () => {
  it('denies writes without core.feature_flag.write and lists flags with usage', async () => {
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
        _clearHotForTest();
        resetFlagCache();
        setFlagCatalog([{ key: 'hiring', description: 'Hiring' }]);

        const rbacRegistry = buildRegistry(inventoryToManifests(INVENTORY));
        const resolve = (roles: readonly string[]) =>
          resolvePermissions(rbacRegistry, roles, IMPLICIT_PERMISSIONS);

        const tenantId = crypto.randomUUID();
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1,'D','d')`, [
          tenantId,
        ]);

        const admin = await createUser(
          {
            tenant_id: tenantId,
            email: 'admin@d.local',
            name: 'Admin',
            password: 'ChangeMe@2026',
            initial_role: { role_slug: 'core.admin', scope_type: 'tenant', scope_id: null },
          },
          { type: 'cli', user_id: null },
        );
        const member = await createUser(
          {
            tenant_id: tenantId,
            email: 'm@d.local',
            name: 'Member',
            password: 'ChangeMe@2026',
            initial_role: { role_slug: 'org.viewer', scope_type: 'tenant', scope_id: null },
          },
          { type: 'cli', user_id: null },
        );

        const adminScope = await getSessionScope(
          { listRoleGrants, resolvePermissions: resolve },
          'admin-sess',
          admin.user_id,
          'admin@d.local',
          'Admin',
        );
        const memberScope = await getSessionScope(
          { listRoleGrants, resolvePermissions: resolve },
          'member-sess',
          member.user_id,
          'm@d.local',
          'Member',
        );

        await expect(
          setFeatureFlag(memberScope, { key: 'hiring', strategies: [{ kind: 'enabled' }] }),
        ).rejects.toBeInstanceOf(FlagError);

        await setFeatureFlag(adminScope, { key: 'hiring', strategies: [{ kind: 'enabled' }] });

        const views = await listFeatureFlags(adminScope);
        const hiring = views.find((v) => v.key === 'hiring');
        expect(hiring?.enabled_for_all).toBe(true);
        expect(hiring?.usage.health).toBe('inactive'); // no exposures yet
      },
    );
  });

  it('a write is visible to an immediate re-read (no stale flag cache)', async () => {
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
        _clearHotForTest();
        resetFlagCache();
        setFlagCatalog([{ key: 'people', description: 'People', defaultEnabled: true }]);

        const rbacRegistry = buildRegistry(inventoryToManifests(INVENTORY));
        const resolve = (roles: readonly string[]) =>
          resolvePermissions(rbacRegistry, roles, IMPLICIT_PERMISSIONS);

        const tenantId = crypto.randomUUID();
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1,'D','d')`, [
          tenantId,
        ]);
        const admin = await createUser(
          {
            tenant_id: tenantId,
            email: 'admin@d.local',
            name: 'Admin',
            password: 'ChangeMe@2026',
            initial_role: { role_slug: 'core.admin', scope_type: 'tenant', scope_id: null },
          },
          { type: 'cli', user_id: null },
        );
        const adminScope = await getSessionScope(
          { listRoleGrants, resolvePermissions: resolve },
          'admin-sess',
          admin.user_id,
          'admin@d.local',
          'Admin',
        );

        // Prime the flag cache with the pre-write state (default-ON, no row).
        const before = (await listFeatureFlags(adminScope)).find((v) => v.key === 'people');
        expect(before?.is_overridden).toBe(false);
        expect(before?.default_enabled).toBe(true);

        // Turn the default-ON module fully off (explicit empty-strategies row).
        await setFeatureFlag(adminScope, { key: 'people', strategies: [] });

        // The very next read must reflect the override, not the stale default.
        const after = (await listFeatureFlags(adminScope)).find((v) => v.key === 'people');
        expect(after?.is_overridden).toBe(true);
        expect(after?.enabled_for_all).toBe(false);
        expect(after?.strategies).toEqual([]);
      },
    );
  });
});
