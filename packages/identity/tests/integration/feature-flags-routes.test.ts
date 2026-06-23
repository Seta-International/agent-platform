import {
  createContributionRegistry,
  resetFlagCache,
  runMigrations,
  type SessionEnv,
  type SessionScope,
  setFlagCatalog,
} from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { registerFeatureFlagsRoutes } from '../../src/backend/http/feature-flags.ts';
import { registerIdentityContributions } from '../../src/register.ts';

const session = (tenant: string, perms: string[]): SessionScope =>
  ({
    tenant_id: tenant,
    user_id: crypto.randomUUID(),
    permissions: new Set(perms),
  }) as unknown as SessionScope;

function buildApp(scope: SessionScope): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', scope);
    await next();
  });
  registerFeatureFlagsRoutes(app);
  return app;
}

type RequestFn = (
  method: string,
  path: string,
  body?: unknown,
) => Promise<{ status: number; body: unknown }>;

function buildRequest(app: Hono<SessionEnv>): RequestFn {
  return async (method, path, body) => {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { 'content-type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const res = await app.request(path, init);
    return { status: res.status, body: await res.json() };
  };
}

function withDb(fn: (ctx: { tenant: string }) => Promise<void>): Promise<void> {
  return withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        registerIdentityContributions(reg);
        await runMigrations(reg, { pool });
        const tenant = crypto.randomUUID();
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Demo', $2)`, [
          tenant,
          `demo-${tenant.slice(0, 8)}`,
        ]);
        resetFlagCache();
        setFlagCatalog([{ key: 'hiring', description: 'Hiring' }]);
        await fn({ tenant });
      } finally {
        resetCoreDb();
        resetFlagCache();
        await closePools();
      }
    },
  );
}

describe('feature-flags routes', () => {
  it('lists flags and rejects a write without core.feature_flag.write', async () => {
    await withDb(async ({ tenant }) => {
      const adminPerms = ['core.feature_flag.read', 'core.feature_flag.write'];
      const viewerPerms: string[] = []; // org.viewer has no feature_flag permissions

      const adminApp = buildApp(session(tenant, adminPerms));
      const viewerApp = buildApp(session(tenant, viewerPerms));

      const adminReq = buildRequest(adminApp);
      const viewerReq = buildRequest(viewerApp);

      // GET /api/identity/v1/feature-flags as admin → 200, includes 'hiring'
      const listRes = await adminReq('GET', '/api/identity/v1/feature-flags');
      expect(listRes.status).toBe(200);
      const flags = (listRes.body as { flags: { key: string }[] }).flags;
      expect(flags.map((f) => f.key)).toContain('hiring');

      // POST as viewer (no core.feature_flag.write) → 403
      const denyRes = await viewerReq('POST', '/api/identity/v1/feature-flags/hiring', {
        strategies: [{ kind: 'enabled' }],
      });
      expect(denyRes.status).toBe(403);

      // POST as admin → 200
      const writeRes = await adminReq('POST', '/api/identity/v1/feature-flags/hiring', {
        strategies: [{ kind: 'enabled' }],
      });
      expect(writeRes.status).toBe(200);
      expect((writeRes.body as { ok: boolean }).ok).toBe(true);

      // Subsequent GET shows enabled_for_all === true
      resetFlagCache(); // evict cache so fresh read sees the DB change
      const afterRes = await adminReq('GET', '/api/identity/v1/feature-flags');
      expect(afterRes.status).toBe(200);
      const hiringAfter = (
        afterRes.body as { flags: { key: string; enabled_for_all: boolean }[] }
      ).flags.find((f) => f.key === 'hiring');
      expect(hiringAfter?.enabled_for_all).toBe(true);
    });
  });
});
