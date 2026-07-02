import { createUser, listRoleAssignments } from '@seta/identity';
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

  it('hashRoleSummary is order-independent but sensitive to assignment scope', () => {
    const g1 = {
      role_slug: 'planner.member',
      scope_kind: 'group' as const,
      scope_id: 'g1',
      granted_at: new Date(),
    };
    const g2 = {
      role_slug: 'planner.member',
      scope_kind: 'group' as const,
      scope_id: 'g2',
      granted_at: new Date(),
    };
    const admin = {
      role_slug: 'org.admin',
      scope_kind: 'tenant' as const,
      scope_id: null,
      granted_at: new Date(),
    };

    const forward = rollup([g1, admin]);
    const reversed = rollup([admin, g1]);
    expect(hashRoleSummary(forward)).toBe(hashRoleSummary(reversed));

    const differentScope = rollup([g2, admin]);
    expect(hashRoleSummary(forward)).not.toBe(hashRoleSummary(differentScope));
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
            { listRoleAssignments, resolvePermissions: () => new Set() },
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
            { listRoleAssignments, resolvePermissions: () => new Set() },
            sessionId,
            user_id,
            'a@d.local',
            'A',
          );
          expect(scope2.role_summary.roles).toEqual(['org.admin']);

          const orgSessionId = `test-session-${crypto.randomUUID()}`;
          const deps = {
            listRoleAssignments: async () => ({
              tenant_id: tenantId,
              assignments: [
                {
                  role_slug: 'pm.manager',
                  scope_kind: 'org_unit' as const,
                  scope_id: 'root-a',
                  granted_at: new Date(),
                },
                {
                  role_slug: 'pm.viewer',
                  scope_kind: 'tenant' as const,
                  scope_id: null,
                  granted_at: new Date(),
                },
              ],
            }),
            resolvePermissions: async () => new Set(['pm.project.read']),
            expandOrgUnits: async (_t: string, ids: readonly string[]) =>
              Object.fromEntries(ids.map((id) => [id, [id, 'child-1']])),
          };
          const scope3 = await getSessionScope(deps, orgSessionId, user_id, 'a@b.c', 'A');
          const orgAssignment = scope3.assignments.find((a) => a.scope_kind === 'org_unit');
          expect(orgAssignment?.org_unit_ids).toEqual(['root-a', 'child-1']);

          _clearHotForTest();
          const hydrated = await getSessionScope(deps, orgSessionId, user_id, 'a@b.c', 'A');
          expect(
            hydrated.assignments.find((a) => a.scope_kind === 'org_unit')?.org_unit_ids,
          ).toEqual(['root-a', 'child-1']);
        } finally {
          await closePools();
          resetCoreDb();
        }
      },
    );
  });
});
