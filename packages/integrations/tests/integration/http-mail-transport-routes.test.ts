import type { SessionEnv } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { createUser } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { resetIntegrationsDb } from '../../src/backend/db/client.ts';
import { registerMailTransportRoutes } from '../../src/backend/http/index.ts';
import { integrationsErrorMapper } from '../../src/register.ts';

function makeErrorHandler(
  ...mappers: Array<(err: Error) => { status: number; body: unknown } | null>
) {
  return (err: Error, c: Context) => {
    for (const mapper of mappers) {
      const mapped = mapper(err);
      if (mapped) return c.json(mapped.body as never, mapped.status as never);
    }
    throw err;
  };
}

function appFor(scope: { user_id: string; tenant_id: string }) {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', scope as never);
    await next();
  });
  registerMailTransportRoutes(app, {
    cryptoSvc: {} as never,
    mailerEnv: {} as never,
    lookupEntraTenantId: async () => null,
  });
  app.onError(makeErrorHandler(integrationsErrorMapper));
  return app;
}

function testDbOpts() {
  return {
    templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
    baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
  };
}

describe('mail transport routes — error mapping (FUT-4)', () => {
  it('maps a missing-permission GET to 403 instead of a bare 500', async () => {
    await withTestDb(testDbOpts(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIntegrationsDb();
      initPools({ databaseUrl });
      try {
        const tenantId = crypto.randomUUID();
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Acme', $2)`, [
          tenantId,
          `acme-${tenantId.slice(0, 8)}`,
        ]);

        // integrations.viewer holds mail.read but not mail.configure — the GET route
        // requires mail.configure, so this actor should be rejected with 403.
        const { user_id: viewerId } = await createUser(
          {
            tenant_id: tenantId,
            email: 'viewer@acme.test',
            name: 'Viewer',
            password: 'ChangeMe@2026',
            initial_role: {
              role_slug: 'integrations.viewer',
              scope_type: 'tenant',
              scope_id: null,
            },
          },
          { type: 'cli', user_id: null },
        );
        const viewerRes = await appFor({ user_id: viewerId, tenant_id: tenantId }).request(
          '/api/integrations/v1/mail-transport',
        );
        expect(viewerRes.status).toBe(403);
        expect(await viewerRes.json()).toMatchObject({ error: 'FORBIDDEN' });

        const { user_id: adminId } = await createUser(
          {
            tenant_id: tenantId,
            email: 'admin@acme.test',
            name: 'Admin',
            password: 'ChangeMe@2026',
            initial_role: { role_slug: 'integrations.admin', scope_type: 'tenant', scope_id: null },
          },
          { type: 'cli', user_id: null },
        );
        const adminRes = await appFor({ user_id: adminId, tenant_id: tenantId }).request(
          '/api/integrations/v1/mail-transport',
        );
        expect(adminRes.status).toBe(200);
        expect(await adminRes.json()).toBeNull();
      } finally {
        resetCoreDb();
        resetIntegrationsDb();
        await closePools();
      }
    });
  });
});
