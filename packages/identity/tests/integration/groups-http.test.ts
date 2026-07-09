import {
  createContributionRegistry,
  runMigrations,
  type SessionEnv,
  type SessionScope,
} from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { registerGroupRoutes } from '../../src/backend/http/groups.ts';
import { registerIdentityContributions } from '../../src/register.ts';
import { createTestTenantWithAdmin, resetIdentityDb } from '../../src/testing/index.ts';

function buildApp(scope: SessionScope): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', scope);
    await next();
  });
  // Mirrors apps/server/src/build.ts's per-request scoped() binding. No appDatabaseUrl
  // here, so the tenant GUC is inert (self-host fallback) — this just opens the
  // executor context identityDb() requires.
  app.use('*', (_c, next) => scoped(scope.tenant_id, next));
  registerGroupRoutes(app);
  return app;
}

function buildRequest(app: Hono<SessionEnv>) {
  return async (method: string, path: string, body?: unknown) => {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { 'content-type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const res = await app.request(path, init);
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json };
  };
}

describe('groups http', () => {
  it('creates and lists groups', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        resetIdentityDb();
        initPools({ databaseUrl });
        try {
          const reg = createContributionRegistry();
          registerCoreContributions(reg);
          registerIdentityContributions(reg);
          await runMigrations(reg, { pool });

          const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });

          const scope = { user_id: admin_user_id, tenant_id } as unknown as SessionScope;
          const app = buildApp(scope);
          const req = buildRequest(app);

          const created = await req('POST', '/api/identity/v1/groups', {
            slug: 'hr',
            name: 'HR',
            kind: 'default',
          });
          expect(created.status).toBe(200);
          expect(typeof (created.body as { group_id: string }).group_id).toBe('string');

          const list = await req('GET', '/api/identity/v1/groups');
          expect(list.status).toBe(200);
          const slugs = (list.body as { groups: { slug: string }[] }).groups.map((g) => g.slug);
          expect(slugs).toContain('hr');

          // malformed body (missing required `name`) → 400, not 500
          const bad = await req('POST', '/api/identity/v1/groups', { slug: 'no-name' });
          expect(bad.status).toBe(400);
          expect((bad.body as { error: string }).error).toBe('VALIDATION');
        } finally {
          resetCoreDb();
          resetIdentityDb();
          await closePools();
        }
      },
    );
  });
});
