import { createUser, grantRole, listRoleAssignments } from '@seta/identity';
import { registerIdentityContributions } from '@seta/identity/register';
import { closePools, getPool, initPools, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../../src/db/client.ts';
import { createContributionRegistry, runMigrations } from '../../src/index.ts';
import { registerCoreContributions } from '../../src/register.ts';
import { startDispatcher } from '../../src/runtime/index.ts';
import { _clearHotForTest, getSessionScope } from '../../src/session/scope.ts';

describe('invalidation subscribers drain identity events', () => {
  it('marks session_scope_cache.invalidated_at after role_grant.changed', async () => {
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
        const dispatcher = await startDispatcher({
          pool: getPool('worker'),
          subscribers: [...reg.collected.subscribers],
          pollIntervalMs: 100,
        });
        const tenantId = crypto.randomUUID();
        try {
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Demo', 'demo')`,
            [tenantId],
          );
          // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
          // fallback) — this only opens the executor context identityDb() requires.
          // The dispatcher's own subscriber handlers already run inside their own
          // scoped(row.tenantId, ...) via drain.ts — this wrap covers only the test's
          // direct createUser/grantRole/getSessionScope calls.
          await scoped(tenantId, async () => {
            // No initial_role — avoids emitting role_grant.changed during createUser so that
            // the only such event is the explicit grantRole call below.
            const { user_id } = await createUser(
              {
                tenant_id: tenantId,
                email: 'a@d.local',
                name: 'A',
                password: 'ChangeMe@2026',
              },
              { type: 'cli', user_id: null },
            );
            const sessionId = `sess-${crypto.randomUUID()}`;
            _clearHotForTest();
            await getSessionScope(
              { listRoleAssignments, resolvePermissions: () => new Set() },
              sessionId,
              user_id,
              'a@d.local',
              'A',
            );

            await grantRole(
              {
                user_id,
                tenant_id: tenantId,
                role_slug: 'planner.viewer',
                scope_type: 'tenant',
                scope_id: null,
              },
              { type: 'cli', user_id: null },
            );

            const start = Date.now();
            let invalidated: Date | null = null;
            while (Date.now() - start < 5000) {
              const row = (
                await pool.query(
                  `SELECT invalidated_at FROM core.session_scope_cache WHERE session_id = $1`,
                  [sessionId],
                )
              ).rows[0];
              if (row?.invalidated_at) {
                invalidated = row.invalidated_at;
                break;
              }
              await new Promise((r) => setTimeout(r, 100));
            }
            expect(invalidated).not.toBeNull();
          });
        } finally {
          await dispatcher.shutdown(2_000);
          await closePools();
          resetCoreDb();
        }
      },
    );
  });
});
