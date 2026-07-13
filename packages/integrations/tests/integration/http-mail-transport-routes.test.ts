import type { SessionEnv } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import { withTestDb } from '@seta/shared-testing';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { resetIntegrationsDb } from '../../src/backend/db/client.ts';
import { registerMailTransportRoutes } from '../../src/backend/http/index.ts';
import { integrationsErrorMapper } from '../../src/register.ts';

const registry = buildRegistry(inventoryToManifests(INVENTORY));
// Mirrors how a real session's `permissions` set is resolved from roles — whether those
// roles came from a direct grant or (as every admin-UI grant does) via group membership
// is core/identity's concern; buildActor's only job is to trust whatever the session carries.
function permsFor(roles: string[]): ReadonlySet<string> {
  return resolvePermissions(registry, roles, IMPLICIT_PERMISSIONS);
}

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

function appFor(scope: { user_id: string; tenant_id: string; permissions: ReadonlySet<string> }) {
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
  it('maps a missing-permission GET to 403 with a friendly message, and allows an admin', async () => {
    await withTestDb(testDbOpts(), async ({ databaseUrl }) => {
      resetCoreDb();
      resetIntegrationsDb();
      initPools({ databaseUrl });
      try {
        const tenantId = crypto.randomUUID();
        const userId = crypto.randomUUID();

        // integrations.viewer holds mail.read but not mail.configure — the GET route
        // requires mail.configure, so this actor should be rejected with 403.
        const viewerRes = await appFor({
          user_id: userId,
          tenant_id: tenantId,
          permissions: permsFor(['integrations.viewer']),
        }).request('/api/integrations/v1/mail-transport');
        expect(viewerRes.status).toBe(403);
        expect(await viewerRes.json()).toMatchObject({
          error: 'FORBIDDEN',
          message:
            "You don't have permission to configure mail settings. Ask your workspace admin for access.",
        });

        const adminRes = await appFor({
          user_id: userId,
          tenant_id: tenantId,
          permissions: permsFor(['integrations.admin']),
        }).request('/api/integrations/v1/mail-transport');
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
