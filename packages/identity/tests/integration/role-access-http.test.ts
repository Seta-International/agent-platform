import {
  createContributionRegistry,
  runMigrations,
  type SessionEnv,
  type SessionScope,
} from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { identityDb } from '../../src/backend/db/index.ts';
import { rolePermissionOverlays } from '../../src/backend/db/schema.ts';
import { registerRoleAccessRoutes } from '../../src/backend/http/role-access.ts';
import { IdentityError } from '../../src/index.ts';
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
  registerRoleAccessRoutes(app);
  app.onError((err, c) => {
    if (err instanceof IdentityError) {
      const status = err.code === 'FORBIDDEN' ? 403 : err.code === 'USER_NOT_FOUND' ? 404 : 400;
      return c.json({ error: err.code, message: err.message }, status);
    }
    throw err;
  });
  return app;
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
        await fn({ tenant });
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );
}

describe('role-access HTTP routes', () => {
  it('GET returns the matrix for a reader', async () => {
    await withDb(async ({ tenant }) => {
      const app = buildApp(session(tenant, ['identity.role.read']));
      const res = await app.request('/api/identity/v1/role-access?module=knowledge');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { roles: Array<{ slug: string }> };
      expect(body.roles.map((r) => r.slug)).toContain('knowledge.viewer');
    });
  });

  it('GET is 403 without identity.role.read', async () => {
    await withDb(async ({ tenant }) => {
      const app = buildApp(session(tenant, []));
      const res = await app.request('/api/identity/v1/role-access');
      expect(res.status).toBe(403);
    });
  });

  it('PUT a cell persists the overlay', async () => {
    await withDb(async ({ tenant }) => {
      const app = buildApp(session(tenant, ['identity.role.write']));
      const res = await app.request(
        '/api/identity/v1/role-access/knowledge.viewer/knowledge.file.write',
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: true }),
        },
      );
      expect(res.status).toBe(200);
      const rows = await identityDb()
        .select()
        .from(rolePermissionOverlays)
        .where(eq(rolePermissionOverlays.tenant_id, tenant));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.effect).toBe('grant');
    });
  });

  it('POST reset clears overlays for the role', async () => {
    await withDb(async ({ tenant }) => {
      const app = buildApp(session(tenant, ['identity.role.write']));
      await identityDb().insert(rolePermissionOverlays).values({
        tenant_id: tenant,
        role_slug: 'knowledge.viewer',
        permission_key: 'knowledge.file.write',
        effect: 'grant',
      });
      const res = await app.request('/api/identity/v1/role-access/knowledge.viewer/reset', {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      const rows = await identityDb()
        .select()
        .from(rolePermissionOverlays)
        .where(eq(rolePermissionOverlays.tenant_id, tenant));
      expect(rows).toHaveLength(0);
    });
  });
});
