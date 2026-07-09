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
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { identityDb } from '../../src/backend/db/index.ts';
import { registerDirectoryRoutes } from '../../src/backend/http/directory.ts';
import { createUser, IdentityError } from '../../src/index.ts';
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
  // Mirrors apps/server/src/build.ts's per-request scoped() binding: the real
  // composition root opens this once the tenant is known, so identityDb() has an
  // executor context. No appDatabaseUrl here, so the tenant GUC is inert (self-host
  // fallback) — this just needs to exist for executorPool() to resolve.
  app.use('*', (_c, next) => scoped(scope.tenant_id, next));
  registerDirectoryRoutes(app);
  app.onError((err, c) => {
    if (err instanceof IdentityError) {
      const status = err.code === 'FORBIDDEN' ? 403 : 400;
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

const seed = (tenant: string, email: string, name: string) =>
  createUser(
    { tenant_id: tenant, email, name, password: 'correct-horse-battery-staple' },
    { type: 'cli', user_id: null },
  );

describe('directory HTTP route', () => {
  it('lets a non-admin member (implicit identity.user.read) search the directory', async () => {
    await withDb(async ({ tenant }) => {
      await seed(tenant, 'alice@test.local', 'Alice Anderson');
      await seed(tenant, 'bob@test.local', 'Bob Brown');

      // a Planner Contributor has no identity admin role — only the implicit read.
      const app = buildApp(session(tenant, ['identity.user.read']));
      const res = await app.request('/api/identity/v1/directory?search=ali&limit=8&offset=0');

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        rows: Array<{ user_id: string; name: string; email: string }>;
        total: number;
      };
      expect(body.total).toBe(1);
      expect(body.rows[0]?.name).toBe('Alice Anderson');
      expect(body.rows[0]?.email).toBe('alice@test.local');
      // minimal projection — admin-only fields must not leak to the directory
      expect(body.rows[0]).not.toHaveProperty('role_slugs');
      expect(body.rows[0]).not.toHaveProperty('status');
      expect(body.rows[0]).not.toHaveProperty('last_seen_at');
    });
  });

  it('returns 403 when the session lacks identity.user.read', async () => {
    await withDb(async ({ tenant }) => {
      const app = buildApp(session(tenant, []));
      const res = await app.request('/api/identity/v1/directory');
      expect(res.status).toBe(403);
    });
  });

  it('excludes deactivated users from the directory', async () => {
    await withDb(async ({ tenant }) => {
      const { user_id } = await seed(tenant, 'charlie@test.local', 'Charlie Clark');
      // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
      // fallback) — this only opens the executor context identityDb() requires.
      await scoped(tenant, () =>
        identityDb().execute(
          sql`UPDATE identity."user" SET deactivated_at = now() WHERE id = ${user_id}`,
        ),
      );
      const app = buildApp(session(tenant, ['identity.user.read']));
      const res = await app.request('/api/identity/v1/directory?search=charlie');
      const body = (await res.json()) as { rows: unknown[]; total: number };
      expect(body.total).toBe(0);
    });
  });
});
