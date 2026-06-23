// packages/core/tests/integration/session-features.test.ts
import { createUser, listRoleGrants } from '@seta/identity';
import { registerIdentityContributions } from '@seta/identity/register';
import { initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../../src/db/client.ts';
import { isFeatureEnabled } from '../../src/flags/is-feature-enabled.ts';
import { createContributionRegistry, getSessionScope, runMigrations } from '../../src/index.ts';
import { registerCoreContributions } from '../../src/register.ts';
import { _clearHotForTest } from '../../src/session/scope.ts';

describe('session features', () => {
  it('populates SessionScope.features from the injected resolver', async () => {
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

        const tenantId = crypto.randomUUID();
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1,'D','d')`, [
          tenantId,
        ]);
        const { user_id } = await createUser(
          {
            tenant_id: tenantId,
            email: 'a@d.local',
            name: 'A',
            password: 'ChangeMe@2026',
            initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
          },
          { type: 'cli', user_id: null },
        );

        const scope = await getSessionScope(
          {
            listRoleGrants,
            resolvePermissions: () => new Set(),
            resolveFeatures: async () => new Set(['hiring']),
          },
          'sess-1',
          user_id,
          'a@d.local',
          'A',
        );
        expect([...scope.features]).toEqual(['hiring']);
        expect(isFeatureEnabled(scope, 'hiring')).toBe(true);
        expect(isFeatureEnabled(scope, 'nope')).toBe(false);
      },
    );
  });
});
