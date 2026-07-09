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
import { registerTenantSettingsRoutes } from '../../src/backend/http/tenant-settings.ts';
import { IdentityError } from '../../src/index.ts';
import { registerIdentityContributions } from '../../src/register.ts';
import { seedTenantWithUsers } from '../helpers/seed-tenant.ts';

const session = (tenant: string, userId: string, roles: string[]): SessionScope =>
  ({
    tenant_id: tenant,
    user_id: userId,
    role_summary: { roles, cross_tenant_read: false },
  }) as unknown as SessionScope;

function buildApp(scope: SessionScope): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', scope);
    await next();
  });
  // Mirrors apps/server/src/build.ts's per-request scoped() binding: the real
  // composition root opens this once the tenant is known, so identityDb() has an
  // executor context. No appDatabaseUrl here, so the tenant GUC is inert (self-host
  // fallback) — this just needs to exist for executorPool() to resolve.
  app.use('*', (_c, next) => scoped(scope.tenant_id, next));
  registerTenantSettingsRoutes(app);
  app.onError((err, c) => {
    if (err instanceof IdentityError) {
      const status = err.code === 'FORBIDDEN' ? 403 : 400;
      return c.json({ error: err.code, message: err.message }, status);
    }
    throw err;
  });
  return app;
}

function withDb(
  fn: (ctx: { tenant_id: string; admin: string; users: string[] }) => Promise<void>,
): Promise<void> {
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
        const { tenant_id, admin, users } = await seedTenantWithUsers(pool, 1);
        await fn({ tenant_id, admin, users });
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );
}

const getSettings = (app: Hono<SessionEnv>) =>
  app.request('/api/identity/v1/tenants/me/settings', { method: 'GET' });

const patchDomains = (app: Hono<SessionEnv>, body: unknown) =>
  app.request('/api/identity/v1/tenants/me/email-domains', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('tenant-settings email_domains', () => {
  it('GET returns email_domains as empty array by default', async () => {
    await withDb(async ({ tenant_id, admin }) => {
      const app = buildApp(session(tenant_id, admin, ['org.admin']));
      const res = await getSettings(app);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { email_domains: string[] };
      expect(body.email_domains).toEqual([]);
    });
  });

  it('PATCH sets email_domains and GET reflects the update', async () => {
    await withDb(async ({ tenant_id, admin }) => {
      const app = buildApp(session(tenant_id, admin, ['org.admin']));
      const patch = await patchDomains(app, { email_domains: ['acme.com'] });
      expect(patch.status).toBe(200);
      expect(await patch.json()).toEqual({ ok: true });

      const get = await getSettings(app);
      const body = (await get.json()) as { email_domains: string[] };
      expect(body.email_domains).toEqual(['acme.com']);
    });
  });

  it('PATCH by non-admin returns 403', async () => {
    await withDb(async ({ tenant_id, users }) => {
      const app = buildApp(session(tenant_id, users[0]!, []));
      const res = await patchDomains(app, { email_domains: ['acme.com'] });
      expect(res.status).toBe(403);
    });
  });
});
