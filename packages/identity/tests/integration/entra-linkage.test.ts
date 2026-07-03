import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import { resetIdentityDb } from '../../src/backend/db/index.ts';
import * as schema from '../../src/backend/db/schema.ts';
import { entraLinkageSubscribers } from '../../src/backend/subscribers/entra-linkage.ts';
import { dispatch } from '../helpers/bus.ts';

const TENANT = '00000000-0000-0000-0000-0000000000e1';
const ENTRA_A = '11111111-2222-3333-4444-555555555555';
const ENTRA_B = '99999999-8888-7777-6666-555555555555';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function findProvider(pool: import('pg').Pool) {
  const db = drizzle(pool, { schema });
  return db
    .select()
    .from(schema.tenantSsoProviders)
    .where(
      and(
        eq(schema.tenantSsoProviders.tenant_id, TENANT),
        eq(schema.tenantSsoProviders.provider_id, 'microsoft-entra-id'),
      ),
    );
}

describe('entraLinkageSubscribers', () => {
  it('projects entra_tenant_id on first event (seeds disabled, empty config) then updates idempotently', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          TENANT,
          'Entra Linkage Tenant',
          `entra-link-${TENANT.slice(0, 8)}`,
        ]);

        const ev = {
          eventType: 'integrations.m365_tenant_config.updated',
          tenantId: TENANT,
          payload: { entraTenantId: ENTRA_A, enabled: true },
        };

        await dispatch(entraLinkageSubscribers, ev);
        await dispatch(entraLinkageSubscribers, ev); // idempotent replay

        let rows = await findProvider(pool);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          entra_tenant_id: ENTRA_A,
          enabled: false, // seeded disabled; SSO-enable stays admin-controlled
          config: {},
        });

        // Changed entra id updates the linkage in place.
        await dispatch(entraLinkageSubscribers, {
          eventType: 'integrations.m365_tenant_config.updated',
          tenantId: TENANT,
          payload: { entraTenantId: ENTRA_B, enabled: true },
        });

        rows = await findProvider(pool);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.entra_tenant_id).toBe(ENTRA_B);
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('does not clobber an admin-controlled enabled flag or config on conflict', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          TENANT,
          'Entra Linkage Tenant',
          `entra-link2-${TENANT.slice(0, 8)}`,
        ]);

        // Admin registered + enabled SSO first, with consent metadata in config.
        const adminConfig = {
          consent_granted_at: '2026-01-01T00:00:00.000Z',
          consent_granted_by_oid: 'oid-1',
          consent_granted_by_email: 'admin@acme.test',
        };
        await pool.query(
          `INSERT INTO identity.tenant_sso_providers (tenant_id, provider_id, enabled, config)
           VALUES ($1, 'microsoft-entra-id', true, $2::jsonb)`,
          [TENANT, JSON.stringify(adminConfig)],
        );

        await dispatch(entraLinkageSubscribers, {
          eventType: 'integrations.m365_tenant_config.updated',
          tenantId: TENANT,
          payload: { entraTenantId: ENTRA_A, enabled: false },
        });

        const rows = await findProvider(pool);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          entra_tenant_id: ENTRA_A, // linkage projected in
          enabled: true, // admin flag preserved (payload.enabled=false ignored)
          config: adminConfig, // consent metadata preserved
        });
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
