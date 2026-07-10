import { createContributionRegistry } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import * as identityPkg from '@seta/identity';
import { auth } from '@seta/identity/auth';
import { registerIdentityContributions } from '@seta/identity/register';
import { closePools, currentExecutorMode, initPools, maintenance } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it, vi } from 'vitest';
import { buildServerApp, registerAppContributions } from '../../src/build.ts';

const { createUser } = identityPkg;

// FUT-540: agent.attach(app) (build.ts) mounts every agent HTTP route BEFORE
// app.use('*', sessionMiddleware). Per Hono's registration-order semantics,
// middleware registered after a route does not wrap that route — so no agent
// request ever ran inside sessionMiddleware's scope. The fix gives the agent
// session bridge (createAgentSessionBridge, build.ts) its own scoped(tenantId, ...)
// around both listRoleAssignments() and the downstream route handler, opened as
// soon as better-auth resolves the tenant.
//
// This test drives the real buildServerApp() composition root (mirrors
// smoke.test.ts) with a real better-auth login, then hits the cheapest
// agentDb()-backed agent route (GET /api/agent/v1/workflows/my-pending-approvals —
// session-gated only, no LLM call) to confirm the route handler is actually
// reached, inside a scoped executor context, not a theoretical read of the code.
describe('agent routes vs. executor context (FUT-540)', () => {
  it('reaches the agent route handler inside a scoped executor context', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        initPools({ databaseUrl });
        try {
          const reg = createContributionRegistry();
          registerCoreContributions(reg);
          registerIdentityContributions(reg);
          registerAppContributions(reg);

          const tenantId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Demo', 'demo')`,
            [tenantId],
          );
          const email = 'probe@d.local';
          const password = 'sign-in-password-1234';
          // Seeding acts as the CLI seeder (actor: { type: 'cli' }): maintenance()
          // mirrors the admin-pool context apps/cli opens around program.parseAsync
          // in production.
          await maintenance(() =>
            createUser(
              { tenant_id: tenantId, email, name: 'Probe', password },
              { type: 'cli', user_id: null },
            ),
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

          // Probe the executor mode at the exact moment build.ts's agent bridge
          // calls listRoleAssignments() — the call this bug broke — without
          // changing its behaviour.
          const originalListRoleAssignments = identityPkg.listRoleAssignments;
          let modeDuringBridge: string | undefined;
          const spy = vi
            .spyOn(identityPkg, 'listRoleAssignments')
            .mockImplementation(async (userId: string) => {
              modeDuringBridge = currentExecutorMode();
              return originalListRoleAssignments(userId);
            });

          const fakeWorkers = { addJob: vi.fn(async () => {}), shutdown: async () => {} };
          const { app } = buildServerApp(reg, {
            pool,
            databaseUrl,
            workers: fakeWorkers,
            streams: new Map(),
          });

          try {
            // A valid, authenticated cookie hits a session-gated agent route: the
            // bridge must resolve role assignments and the route handler must run
            // its own agentDb()-backed query, both inside a scoped executor context.
            const res = await app.request('/api/agent/v1/workflows/my-pending-approvals', {
              headers: { cookie: cookieHeader },
            });
            expect(res.status).toBe(200);
            const body = (await res.json()) as unknown[];
            expect(Array.isArray(body)).toBe(true);
            expect(modeDuringBridge).toBe('scoped');
          } finally {
            spy.mockRestore();
          }
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
