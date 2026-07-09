import { fileURLToPath } from 'node:url';
import { createContributionRegistry } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { sessionScopeCache } from '@seta/core/db/schema';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { createUser } from '@seta/identity';
import { auth } from '@seta/identity/auth';
import { registerIdentityContributions } from '@seta/identity/register';
import { closePools, initPools, runMigrations } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { buildServerApp, registerAppContributions } from '../../src/build.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// FUT-540: getSessionScope() (packages/core/src/session/scope.ts) reads
// core.session_scope_cache first; a warm cache row hides the defect this test
// targets. A brand-new session has no cache row yet, so getSessionScope falls
// through to listRoleAssignments() -> identityDb() -> executorPool(), which
// throws unless sessionMiddleware already opened a scope before calling it.
// This test proves the fix works on that genuine miss, not just on a warm cache.
describe('session middleware cache-miss regression (FUT-540)', () => {
  it('serves an authenticated request when core.session_scope_cache has no row yet for the session', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        initPools({ databaseUrl });
        try {
          // apps/server's test template (tests/global-setup.ts) doesn't include
          // people's migrations; sessionMiddleware's getSessionScope() always calls
          // resolveWorkerId (@seta/people), so that schema must exist for a real
          // cache-miss request to reach the route handler at all.
          await runMigrations({
            pool,
            modules: [
              {
                name: 'people',
                dir: `${__dirname}/../../../../packages/people/drizzle/migrations`,
              },
            ],
          });

          const reg = createContributionRegistry();
          registerCoreContributions(reg);
          registerIdentityContributions(reg);
          registerAppContributions(reg);

          const tenantId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Demo', 'demo')`,
            [tenantId],
          );
          const email = 'cache-miss@d.local';
          const password = 'sign-in-password-1234';
          await createUser(
            { tenant_id: tenantId, email, name: 'Probe', password },
            { type: 'cli', user_id: null },
          );

          // Real better-auth login — same as production, no session mocking.
          const signIn = await auth.api.signInEmail({
            body: { email, password },
            asResponse: true,
          });
          expect(signIn.status).toBe(200);
          const setCookies = signIn.headers.getSetCookie
            ? signIn.headers.getSetCookie()
            : [signIn.headers.get('set-cookie') ?? ''];
          const cookieHeader = setCookies
            .map((c) => c.split(';')[0])
            .filter(Boolean)
            .join('; ');

          // Confirm the precondition: this is a genuine cache miss, not an
          // incidentally-cold cache we forgot to warm.
          const session = await auth.api.getSession({
            headers: new Headers({ cookie: cookieHeader }),
          });
          if (!session?.session.id) throw new Error('expected an authenticated session');
          const preExisting = await coreDb()
            .select()
            .from(sessionScopeCache)
            .where(eq(sessionScopeCache.session_id, session.session.id));
          expect(preExisting).toHaveLength(0);

          const fakeWorkers = { addJob: vi.fn(async () => {}), shutdown: async () => {} };
          const { app } = buildServerApp(reg, {
            pool,
            databaseUrl,
            workers: fakeWorkers,
            streams: new Map(),
          });

          // First request on this session — getSessionScope() must build the scope
          // (not read it from a warm cache), which requires the executor context to
          // already be open when it runs.
          const res = await app.request('/api/identity/v1/me', {
            headers: { cookie: cookieHeader },
          });
          expect(res.status).toBe(200);
          const body = (await res.json()) as { tenant_id: string; email: string };
          expect(body.tenant_id).toBe(tenantId);
          expect(body.email).toBe(email);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
