// packages/core/tests/integration/product-gate-intersection.test.ts
import { createUser, listRoleAssignments } from '@seta/identity';
import { registerIdentityContributions } from '@seta/identity/register';
import { initPools, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../../src/db/client.ts';
import { createContributionRegistry, getSessionScope, runMigrations } from '../../src/index.ts';
import { registerCoreContributions } from '../../src/register.ts';
import { _clearHotForTest } from '../../src/session/scope.ts';

describe('product gate intersection', () => {
  it('strips ungranted product permissions, keeps exempt + non-product, and passes through when dep absent', async () => {
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
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1,'T','t')`, [
          tenantId,
        ]);
        // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
        // fallback) — this only opens the executor context identityDb() requires.
        await scoped(tenantId, async () => {
          const { user_id } = await createUser(
            {
              tenant_id: tenantId,
              email: 'gate@g.local',
              name: 'Gate',
              password: 'ChangeMe@2026',
              initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
            },
            { type: 'cli', user_id: null },
          );

          const rawPerms = new Set([
            'pm.account.read',
            'people.worker.read',
            'people.self.read',
            'core.audit.read',
          ]);

          // Case 1: with resolveProductAccess granting only 'pm'
          const scope = await getSessionScope(
            {
              listRoleAssignments,
              resolvePermissions: async () => rawPerms,
              resolveProductAccess: async () => new Set(['pm']),
            },
            'sess-gate-1',
            user_id,
            'gate@g.local',
            'Gate',
          );
          expect(scope.permissions.has('pm.account.read')).toBe(true); // pm granted
          expect(scope.permissions.has('people.worker.read')).toBe(false); // people not granted → stripped
          expect(scope.permissions.has('people.self.read')).toBe(true); // exempt
          expect(scope.permissions.has('core.audit.read')).toBe(true); // non-product namespace
          expect([...scope.product_access]).toEqual(['pm']);

          // Case 2: cached path — clear hot cache, same session id, different resolveProductAccess
          _clearHotForTest();
          const scopeCached = await getSessionScope(
            {
              listRoleAssignments,
              resolvePermissions: async () => rawPerms,
              resolveProductAccess: async () => new Set(['pm']),
            },
            'sess-gate-1',
            user_id,
            'gate@g.local',
            'Gate',
          );
          expect(scopeCached.permissions.has('pm.account.read')).toBe(true);
          expect(scopeCached.permissions.has('people.worker.read')).toBe(false);
          expect([...scopeCached.product_access]).toEqual(['pm']);

          // Case 3: WITHOUT resolveProductAccess — permissions pass through unstripped; product_access is empty
          const { user_id: user2 } = await createUser(
            {
              tenant_id: tenantId,
              email: 'gate2@g.local',
              name: 'Gate2',
              password: 'ChangeMe@2026',
              initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
            },
            { type: 'cli', user_id: null },
          );
          const scopeNoDep = await getSessionScope(
            {
              listRoleAssignments,
              resolvePermissions: async () => rawPerms,
              // no resolveProductAccess
            },
            'sess-gate-2',
            user2,
            'gate2@g.local',
            'Gate2',
          );
          // all raw perms should be present — no stripping
          expect(scopeNoDep.permissions.has('pm.account.read')).toBe(true);
          expect(scopeNoDep.permissions.has('people.worker.read')).toBe(true);
          expect(scopeNoDep.permissions.has('people.self.read')).toBe(true);
          expect(scopeNoDep.permissions.has('core.audit.read')).toBe(true);
          expect([...scopeNoDep.product_access]).toEqual([]);
        });
      },
    );
  });
});
