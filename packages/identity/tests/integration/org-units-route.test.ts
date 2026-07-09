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

function buildApp(scope?: SessionScope): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  if (scope) {
    app.use('*', async (c, next) => {
      c.set('user', scope);
      await next();
    });
    // Mirrors apps/server/src/build.ts's per-request scoped() binding. No appDatabaseUrl
    // here, so the tenant GUC is inert (self-host fallback) — this just opens the
    // executor context identityDb() requires.
    app.use('*', (_c, next) => scoped(scope.tenant_id, next));
  }
  registerGroupRoutes(app);
  return app;
}

describe('GET /api/identity/v1/org-units', () => {
  it('returns 401 when there is no session', async () => {
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

          const app = buildApp();
          const res = await app.request('/api/identity/v1/org-units');
          expect(res.status).toBe(401);
        } finally {
          resetCoreDb();
          resetIdentityDb();
          await closePools();
        }
      },
    );
  });

  it('lists org units for the session tenant only, ordered by name', async () => {
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
          const { tenant_id: otherTenant } = await createTestTenantWithAdmin({
            pool,
            slug: 'other',
            name: 'Other',
            adminEmail: 'admin-other@demo.local',
          });

          const engId = crypto.randomUUID();
          const salesId = crypto.randomUUID();
          const otherTenantUnitId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO identity.org_unit_projection (org_unit_id, tenant_id, parent_id, name)
             VALUES ($1, $2, NULL, 'Engineering'), ($3, $2, NULL, 'Sales'), ($4, $5, NULL, 'Foreign')`,
            [engId, tenant_id, salesId, otherTenantUnitId, otherTenant],
          );

          const scope = { user_id: admin_user_id, tenant_id } as unknown as SessionScope;
          const app = buildApp(scope);
          const res = await app.request('/api/identity/v1/org-units');
          expect(res.status).toBe(200);
          const body = (await res.json()) as {
            org_units: Array<{ org_unit_id: string; name: string; parent_id: string | null }>;
          };
          expect(body.org_units.map((u) => u.name)).toEqual(['Engineering', 'Sales']);
          expect(body.org_units.map((u) => u.org_unit_id).sort()).toEqual([engId, salesId].sort());
          expect(body.org_units.every((u) => u.parent_id === null)).toBe(true);
        } finally {
          resetCoreDb();
          resetIdentityDb();
          await closePools();
        }
      },
    );
  });
});
