import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { getEntraTenantId } from '../../../src/backend/domain/get-entra-tenant-id.ts';

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
    `INSERT INTO identity.tenant_sso_providers (tenant_id, provider_id, enabled, entra_tenant_id, config)
     VALUES ($1, 'microsoft-entra-id', $2, $3, $4::jsonb)`,
    [
      tenantId,
      opts.enabled,
      entraTid,
      JSON.stringify({
        consent_granted_at: null,
        consent_granted_by_oid: null,
        consent_granted_by_email: null,
      }),
    ],
  );
  return { tenantId, entraTid };
}

describe('getEntraTenantId', () => {
  it('returns the entra_tenant_id when SSO is registered and enabled', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        const { tenantId, entraTid } = await seedProvider(pool, databaseUrl, { enabled: true });
        try {
          // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
          // fallback) — this only opens the executor context identityDb() requires.
          await scoped(tenantId, async () => {
            expect(await getEntraTenantId(tenantId)).toBe(entraTid);
          });
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
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
          // fallback) — this only opens the executor context identityDb() requires.
          await scoped(crypto.randomUUID(), async () => {
            expect(await getEntraTenantId(crypto.randomUUID())).toBeNull();
          });
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
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        const { tenantId } = await seedProvider(pool, databaseUrl, { enabled: false });
        try {
          // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
          // fallback) — this only opens the executor context identityDb() requires.
          await scoped(tenantId, async () => {
            expect(await getEntraTenantId(tenantId)).toBeNull();
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
