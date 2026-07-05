import type { SessionEnv, SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import type { Crypto } from '@seta/shared-crypto';
import { closePools, initPools } from '@seta/shared-db';
import type { MailerEnv } from '@seta/shared-mailer';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { resetIntegrationsDb } from '../../../src/backend/db/client.ts';
import { registerMailTransportRoutes } from '../../../src/backend/http/mail-transport-routes.ts';
import { INTEGRATIONS_PERMISSIONS } from '../../../src/backend/rbac.ts';

const session = (tenantId: string, perms: string[]): SessionScope =>
  ({
    tenant_id: tenantId,
    user_id: crypto.randomUUID(),
    permissions: new Set(perms),
  }) as unknown as SessionScope;

function buildApp(scope: SessionScope): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', scope);
    await next();
  });
  registerMailTransportRoutes(app, {
    cryptoSvc: {} as Crypto,
    mailerEnv: {} as MailerEnv,
    lookupEntraTenantId: async () => null,
  });
  return app;
}

describe('GET /api/integrations/v1/mail-transport (FUT-4 buildActor)', () => {
  it('allows a session whose permission comes only from access-group-derived grants (no direct role_assignments row)', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        resetIntegrationsDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Acme', $2)`, [
            tenantId,
            `acme-${tenantId.slice(0, 8)}`,
          ]);
          // This session's user_id is not backed by any identity.role_assignments row —
          // exactly what happens when a user only holds the permission via an access
          // group (the common case in this codebase, e.g. the seeded "Admin" group).
          // The session's own `permissions` set is the source of truth buildActor must use.
          const scope = session(tenantId, [INTEGRATIONS_PERMISSIONS.mailConfigure]);
          const app = buildApp(scope);

          const res = await app.request('/api/integrations/v1/mail-transport');

          expect(res.status).toBe(200);
        } finally {
          resetIntegrationsDb();
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
