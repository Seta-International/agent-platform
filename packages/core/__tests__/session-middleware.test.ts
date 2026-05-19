import { createUser, grantRole, listRoleGrants } from '@seta/identity';
import { registerIdentityContributions } from '@seta/identity/register';
import { closePools, getPool, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../src/db/client.ts';
import { createContributionRegistry, runMigrations, startDispatcher } from '../src/index.ts';
import { registerCoreContributions } from '../src/register.ts';
import { _clearHotForTest, getSessionScope } from '../src/session/scope.ts';

describe('invalidation subscribers drain identity events', () => {
  it('marks session_scope_cache.invalidated_at after role_grant.changed', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
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
        try {
          const tenantId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Demo', 'demo')`,
            [tenantId],
          );
          // No initial_role — avoids emitting role_grant.changed during createUser so that
          // the only such event is the explicit grantRole call below.
          const { user_id } = await createUser(
            {
              tenant_id: tenantId,
              email: 'a@d.local',
              name: 'A',
              password: 'demo-password-1234',
            },
            { type: 'cli', user_id: null },
          );
          const sessionId = `sess-${crypto.randomUUID()}`;
          _clearHotForTest();
          await getSessionScope({ listRoleGrants }, sessionId, user_id, 'a@d.local', 'A');

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
        } finally {
          await dispatcher.shutdown(2_000);
          await closePools();
          resetCoreDb();
        }
      },
    );
  });
});
