import { createUser, grantRole, listRoleAssignments } from '@seta/identity';
import { registerIdentityContributions } from '@seta/identity/register';
import { closePools, initPools, scoped } from '@seta/shared-db';
import { getPool } from '@seta/shared-db/composition';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../../src/db/client.ts';
import { createContributionRegistry, runMigrations } from '../../src/index.ts';
import { createSessionMiddleware, type SessionEnv } from '../../src/middleware/session.ts';
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

describe('session middleware idle-check executor context (FUT-540)', () => {
  it('serves an authenticated, non-idle-expired request without throwing ExecutorContextError', async () => {
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
          const { user_id } = await scoped(tenantId, () =>
            createUser(
              {
                tenant_id: tenantId,
                email: 'idle-probe@d.local',
                name: 'Probe',
                password: 'ChangeMe@2026',
              },
              { type: 'cli', user_id: null },
            ),
          );
          const sessionId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO identity.session (id, user_id, token, expires_at)
             VALUES ($1, $2, $3, now() + interval '1 day')`,
            [sessionId, user_id, `tok-${sessionId}`],
          );

          const app = new Hono<SessionEnv>();
          app.use(
            '*',
            createSessionMiddleware({
              getSession: async () => ({
                session: { id: sessionId },
                user: {
                  id: user_id,
                  email: 'idle-probe@d.local',
                  name: 'Probe',
                  tenant_id: tenantId,
                },
              }),
              getUserTenant: async () => ({ tenant_id: tenantId }),
              signOut: async () => {},
              listRoleAssignments,
              resolvePermissions: async () => new Set(),
            }),
          );
          app.get('/whoami', (c) => c.json({ user_id: c.get('user').user_id }));

          // Before Fix 4, isIdleExpired() (which calls coreDb()) ran before scoped()
          // opened its context, and threw ExecutorContextError on every authenticated
          // request; Hono's default error handler turns that into a 500.
          const res = await app.request('/whoami');
          expect(res.status).toBe(200);
          const body = (await res.json()) as { user_id: string };
          expect(body.user_id).toBe(user_id);
        } finally {
          await closePools();
          resetCoreDb();
        }
      },
    );
  });
});
