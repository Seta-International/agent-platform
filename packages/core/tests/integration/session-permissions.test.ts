import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { expect, it } from 'vitest';
import { resetCoreDb } from '../../src/db/client.ts';
import { createContributionRegistry, runMigrations } from '../../src/index.ts';
import { registerCoreContributions } from '../../src/register.ts';
import { _clearHotForTest, getSessionScope } from '../../src/session/scope.ts';

it('populates permissions via the injected resolver', async () => {
  await withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      const reg = createContributionRegistry();
      registerCoreContributions(reg);
      await runMigrations(reg, { pool });
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const tenantId = crypto.randomUUID();
        const userId = crypto.randomUUID();
        const sessionId = `sess-${crypto.randomUUID()}`;
        _clearHotForTest();
        const scope = await getSessionScope(
          {
            listRoleGrants: async () => ({
              tenant_id: tenantId,
              grants: [
                {
                  role_slug: 'knowledge.viewer',
                  scope_type: 'tenant',
                  scope_id: null,
                  granted_at: new Date(),
                },
              ],
            }),
            resolvePermissions: (roles) =>
              new Set(roles.includes('knowledge.viewer') ? ['knowledge.file.read'] : []),
          },
          sessionId,
          userId,
          'u@x.test',
          'U',
        );
        expect([...scope.permissions]).toEqual(['knowledge.file.read']);
      } finally {
        await closePools();
        resetCoreDb();
      }
    },
  );
});
