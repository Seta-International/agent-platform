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
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { registerAdminUsersRoutes } from '../../src/backend/http/admin-users.ts';
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
  registerAdminUsersRoutes(app);
  app.onError((err, c) => {
    if (err instanceof IdentityError) {
      const status = err.code === 'FORBIDDEN' ? 403 : err.code === 'USER_NOT_FOUND' ? 404 : 400;
      return c.json({ error: err.code, message: err.message }, status);
    }
    throw err;
  });
  return app;
}

function withDb(
  fn: (ctx: {
    tenant_id: string;
    admin: string;
    users: string[];
    pool: import('pg').Pool;
  }) => Promise<void>,
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
        const { tenant_id, admin, users } = await seedTenantWithUsers(pool, 3);
        await fn({ tenant_id, admin, users, pool });
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );
}

const post = (app: Hono<SessionEnv>, body: unknown) =>
  app.request('/api/identity/v1/users/bulk-role-grants', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /users/bulk-role-grants', () => {
  it('admin bulk-grants and returns the summary', async () => {
    await withDb(async ({ tenant_id, admin, users }) => {
      const app = buildApp(session(tenant_id, admin, ['org.admin']));
      const res = await post(app, {
        user_ids: users,
        role_slug: 'knowledge.viewer',
        action: 'grant',
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { granted: number; skipped: number; failed: unknown[] };
      expect(body.granted).toBe(3);
      expect(body.skipped).toBe(0);
      expect(body.failed).toEqual([]);
    });
  });

  it('non-admin is 403', async () => {
    await withDb(async ({ tenant_id, users }) => {
      const app = buildApp(session(tenant_id, users[0]!, []));
      const res = await post(app, {
        user_ids: users,
        role_slug: 'knowledge.viewer',
        action: 'grant',
      });
      expect(res.status).toBe(403);
    });
  });

  it('unknown role is 400', async () => {
    await withDb(async ({ tenant_id, admin, users }) => {
      const app = buildApp(session(tenant_id, admin, ['org.admin']));
      const res = await post(app, { user_ids: users, role_slug: 'not.a.role', action: 'grant' });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('unknown_role');
    });
  });

  it('group scope is 400 (deferred)', async () => {
    await withDb(async ({ tenant_id, admin, users }) => {
      const app = buildApp(session(tenant_id, admin, ['org.admin']));
      const res = await post(app, {
        user_ids: users,
        role_slug: 'knowledge.viewer',
        action: 'grant',
        scope_type: 'group',
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('group_scope_ui_deferred');
    });
  });
});
