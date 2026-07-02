// packages/core/tests/integration/session-group-ids.test.ts
import { createUser, listRoleAssignments } from '@seta/identity';
import { registerIdentityContributions } from '@seta/identity/register';
import { initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../../src/db/client.ts';
import { createContributionRegistry, getSessionScope, runMigrations } from '../../src/index.ts';
import { registerCoreContributions } from '../../src/register.ts';
import { _clearHotForTest } from '../../src/session/scope.ts';

describe('session group_ids', () => {
  it('populates group_ids from resolver and defaults to [] without one', async () => {
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
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1,'G','g')`, [
          tenantId,
        ]);
        const { user_id } = await createUser(
          {
            tenant_id: tenantId,
            email: 'b@g.local',
            name: 'B',
            password: 'ChangeMe@2026',
            initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
          },
          { type: 'cli', user_id: null },
        );

        // Fresh path: with resolver
        const scope = await getSessionScope(
          {
            listRoleAssignments,
            resolvePermissions: async () => new Set(),
            resolveGroupIds: async () => ['g1', 'g2'],
          },
          'sess-grp-1',
          user_id,
          'b@g.local',
          'B',
        );
        expect(scope.group_ids).toEqual(['g1', 'g2']);

        // Cache-HIT path: clear hot cache only (DB row stays); resolver returns different set
        _clearHotForTest();
        const scopeHit = await getSessionScope(
          {
            listRoleAssignments,
            resolvePermissions: async () => new Set(),
            resolveGroupIds: async () => ['g3'],
          },
          'sess-grp-1',
          user_id,
          'b@g.local',
          'B',
        );
        expect(scopeHit.group_ids).toEqual(['g3']);

        // Fresh path: without resolver → defaults to []
        const { user_id: user2 } = await createUser(
          {
            tenant_id: tenantId,
            email: 'c@g.local',
            name: 'C',
            password: 'ChangeMe@2026',
            initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
          },
          { type: 'cli', user_id: null },
        );
        const scopeNoResolver = await getSessionScope(
          {
            listRoleAssignments,
            resolvePermissions: async () => new Set(),
          },
          'sess-grp-3',
          user2,
          'c@g.local',
          'C',
        );
        expect(scopeNoResolver.group_ids).toEqual([]);
      },
    );
  });
});
