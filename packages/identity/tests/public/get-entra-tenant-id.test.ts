import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { getEntraTenantId } from '../../src/backend/domain/get-entra-tenant-id.ts';

async function seedProvider(
  pool: import('pg').Pool,
  databaseUrl: string,
  opts: { enabled: boolean; entraTid?: string },
) {
  resetCoreDb();
  initPools({ databaseUrl });
  const tenantId = crypto.randomUUID();
  const entraTid = opts.entraTid ?? crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Acme', 'acme')`, [
    tenantId,
  ]);
  await pool.query(
    `INSERT INTO identity.tenant_sso_providers (tenant_id, provider_id, enabled, config, email_domains)
     VALUES ($1, 'microsoft-entra-id', $2, $3::jsonb, $4)`,
    [
      tenantId,
      opts.enabled,
      JSON.stringify({
        entra_tenant_id: entraTid,
        consent_granted_at: null,
        consent_granted_by_oid: null,
        consent_granted_by_email: null,
      }),
      [],
    ],
  );
  return { tenantId, entraTid };
}

describe('getEntraTenantId', () => {
  it('returns the entra_tenant_id when SSO is registered and enabled', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        const { tenantId, entraTid } = await seedProvider(pool, databaseUrl, { enabled: true });
        try {
          expect(await getEntraTenantId(tenantId)).toBe(entraTid);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns null when no SSO is registered for the tenant', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          expect(await getEntraTenantId(crypto.randomUUID())).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns null when the provider exists but is disabled', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        const { tenantId } = await seedProvider(pool, databaseUrl, { enabled: false });
        try {
          expect(await getEntraTenantId(tenantId)).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
