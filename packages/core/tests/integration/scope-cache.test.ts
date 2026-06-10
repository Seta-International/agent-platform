import { createUser, listRoleGrants } from '@seta/identity';
import { registerIdentityContributions } from '@seta/identity/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetCoreDb } from '../../src/db/client.ts';
import { createContributionRegistry, runMigrations } from '../../src/index.ts';
import { registerCoreContributions } from '../../src/register.ts';
import {
  _clearHotForTest,
  getSessionScope,
  hashRoleSummary,
  rollup,
} from '../../src/session/scope.ts';

describe('session scope cache', () => {
  beforeEach(() => _clearHotForTest());

  it('rollup excludes accessible_group_ids from the role-summary hash', () => {
    const summaryA = rollup([
      {
        role_slug: 'planner.contributor',
        scope_type: 'group',
        scope_id: 'g1',
        granted_at: new Date(),
      },
    ]);
    const summaryB = rollup([
      {
        role_slug: 'planner.contributor',
        scope_type: 'group',
        scope_id: 'g2',
        granted_at: new Date(),
      },
    ]);
    expect(hashRoleSummary(summaryA)).toBe(hashRoleSummary(summaryB));
  });

  it('builds and caches on cold call; reads from durable on second cold call after hot clear', async () => {
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
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Demo', 'demo')`,
            [tenantId],
          );
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
          const sessionId = `test-session-${crypto.randomUUID()}`;

          const scope1 = await getSessionScope(
            { listRoleGrants, resolvePermissions: () => new Set() },
            sessionId,
            user_id,
            'a@d.local',
            'A',
          );
          expect(scope1.role_summary.roles).toEqual(['org.admin']);

          const durableRow = (
            await pool.query(
              `SELECT session_id FROM core.session_scope_cache WHERE session_id = $1`,
              [sessionId],
            )
          ).rows[0];
          expect(durableRow.session_id).toBe(sessionId);

          _clearHotForTest();
          const scope2 = await getSessionScope(
            { listRoleGrants, resolvePermissions: () => new Set() },
            sessionId,
            user_id,
            'a@d.local',
            'A',
          );
          expect(scope2.role_summary.roles).toEqual(['org.admin']);
        } finally {
          await closePools();
          resetCoreDb();
        }
      },
    );
  });
});
