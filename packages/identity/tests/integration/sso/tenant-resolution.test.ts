import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  resolveSetaTenantFromEmail,
  validateEntraTid,
} from '../../../src/backend/sso/tenant-resolution.ts';

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
    // email_domains now live on core.tenants (PPL-3); routing JOINs the provider for enabled state.
    await pool.query(
      `INSERT INTO core.tenants (id, name, slug, email_domains) VALUES ($1, 'Acme', 'acme', $2)`,
      [tenantId, opts.domains],
    );
    await pool.query(
      `
      INSERT INTO identity.tenant_sso_providers (tenant_id, provider_id, enabled, entra_tenant_id, config)
      VALUES ($1, 'microsoft-entra-id', $2, $3, $4::jsonb)
    `,
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

  it('returns row for matching domain when enabled', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
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
          expect(out?.entra_tenant_id).toBe(entraTid);
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
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        await setup(pool, databaseUrl, {
          enabled: true,
          domains: ['acme.com'],
        });
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

  it('falls back to user tenant when domain mapping is empty but SSO is enabled', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        const { tenantId } = await setup(pool, databaseUrl, {
          enabled: true,
          domains: [],
        });
        await pool.query(
          `
            INSERT INTO identity."user"
              (id, email, name, email_verified, tenant_id)
            VALUES ($1, $2, $3, $4, $5)
          `,
          [crypto.randomUUID(), 'thu.pham@example.com', 'Thu Pham', true, tenantId],
        );
        try {
          const out = await resolveSetaTenantFromEmail('Thu.Pham@example.com');
          expect(out?.tenant_id).toBe(tenantId);
          expect(out?.provider_id).toBe('microsoft-entra-id');
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
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        await setup(pool, databaseUrl, {
          enabled: false,
          domains: ['acme.com'],
        });
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
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        await setup(pool, databaseUrl, {
          enabled: true,
          domains: ['acme.com'],
        });
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
    const out = validateEntraTid({ entra_tenant_id: 'abc' }, 'abc');
    expect(out).toBe(true);
  });

  it('returns false on mismatch', () => {
    const out = validateEntraTid({ entra_tenant_id: 'abc' }, 'xyz');
    expect(out).toBe(false);
  });

  it('returns false when linkage is not yet projected in (null)', () => {
    const out = validateEntraTid({ entra_tenant_id: null }, 'abc');
    expect(out).toBe(false);
  });
});
