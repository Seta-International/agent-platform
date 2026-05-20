import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { discoverProvider } from '../../src/index.ts';

const TEMPLATE_DB_NAME = process.env.SETA_TEST_PG_TEMPLATE!;
const BASE_URL = process.env.SETA_TEST_PG_BASE!;

async function seedProvider(
  pool: import('pg').Pool,
  opts: { enabled: boolean; domains: string[] },
): Promise<{ tenantId: string }> {
  const tenantId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Acme', 'acme')`, [
    tenantId,
  ]);
  await pool.query(
    `
    INSERT INTO identity.tenant_sso_providers (tenant_id, provider_id, enabled, config, email_domains)
    VALUES ($1, 'microsoft-entra-id', $2, $3::jsonb, $4)
  `,
    [
      tenantId,
      opts.enabled,
      JSON.stringify({
        entra_tenant_id: '11111111-2222-3333-4444-555555555555',
        consent_granted_at: null,
        consent_granted_by_oid: null,
        consent_granted_by_email: null,
      }),
      opts.domains,
    ],
  );
  return { tenantId };
}

describe('discoverProvider', () => {
  it('returns credential when no enabled provider matches domain', async () => {
    await withTestDb(
      { templateDbName: TEMPLATE_DB_NAME, baseUrl: BASE_URL },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        await seedProvider(pool, { enabled: true, domains: ['acme.com'] });
        try {
          const out = await discoverProvider('bob@globex.com');
          expect(out.provider_id).toBe('credential');
          expect(out.redirect_url).toBeUndefined();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns microsoft-entra-id with redirect_url for matching enabled provider (case-insensitive)', async () => {
    await withTestDb(
      { templateDbName: TEMPLATE_DB_NAME, baseUrl: BASE_URL },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        const { tenantId } = await seedProvider(pool, { enabled: true, domains: ['acme.com'] });
        try {
          const out = await discoverProvider('Bob@Acme.com');
          expect(out.provider_id).toBe('microsoft-entra-id');
          expect(out.tenant_id).toBe(tenantId);
          expect(out.redirect_url).toContain('/api/identity/v1/auth/sign-in/social');
          expect(out.redirect_url).toContain('provider=microsoft');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns credential for malformed emails (no @, empty domain)', async () => {
    await withTestDb(
      { templateDbName: TEMPLATE_DB_NAME, baseUrl: BASE_URL },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        await seedProvider(pool, { enabled: true, domains: ['acme.com'] });
        try {
          const noAt = await discoverProvider('no-at-sign');
          expect(noAt.provider_id).toBe('credential');

          const emptyDomain = await discoverProvider('user@');
          expect(emptyDomain.provider_id).toBe('credential');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
