import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  resolveSetaTenantFromEmail,
  validateEntraTid,
} from '../../src/backend/sso/tenant-resolution.ts';

describe('resolveSetaTenantFromEmail', () => {
  async function setup(
    pool: import('pg').Pool,
    databaseUrl: string,
    opts: { enabled: boolean; domains: string[] },
  ) {
    resetCoreDb();
    initPools({ databaseUrl });

    const tenantId = crypto.randomUUID();
    const entraTid = '11111111-2222-3333-4444-555555555555';
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
          entra_tenant_id: entraTid,
          consent_granted_at: null,
          consent_granted_by_oid: null,
          consent_granted_by_email: null,
        }),
        opts.domains,
      ],
    );
    return { tenantId, entraTid };
  }

  it('returns row for matching domain when enabled', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        const { tenantId, entraTid } = await setup(pool, databaseUrl, {
          enabled: true,
          domains: ['acme.com'],
        });
        try {
          const out = await resolveSetaTenantFromEmail('Bob@Acme.COM');
          expect(out?.tenant_id).toBe(tenantId);
          expect(out?.provider_id).toBe('microsoft-entra-id');
          expect(out?.config.entra_tenant_id).toBe(entraTid);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns null when no row matches', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        await setup(pool, databaseUrl, { enabled: true, domains: ['acme.com'] });
        try {
          const out = await resolveSetaTenantFromEmail('bob@globex.com');
          expect(out).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('skips disabled rows even if domain matches', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        await setup(pool, databaseUrl, { enabled: false, domains: ['acme.com'] });
        try {
          const out = await resolveSetaTenantFromEmail('bob@acme.com');
          expect(out).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns null for malformed email (no @ or empty domain)', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        await setup(pool, databaseUrl, { enabled: true, domains: ['acme.com'] });
        try {
          expect(await resolveSetaTenantFromEmail('no-at-sign')).toBeNull();
          expect(await resolveSetaTenantFromEmail('user@')).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

describe('validateEntraTid', () => {
  it('returns true on exact match', () => {
    const out = validateEntraTid(
      {
        config: {
          entra_tenant_id: 'abc',
          consent_granted_at: null,
          consent_granted_by_oid: null,
          consent_granted_by_email: null,
        },
      },
      'abc',
    );
    expect(out).toBe(true);
  });

  it('returns false on mismatch', () => {
    const out = validateEntraTid(
      {
        config: {
          entra_tenant_id: 'abc',
          consent_granted_at: null,
          consent_granted_by_oid: null,
          consent_granted_by_email: null,
        },
      },
      'xyz',
    );
    expect(out).toBe(false);
  });
});
