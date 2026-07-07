import { getTenantEmailDomains } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTenantEmailDomains } from '../../src/backend/domain/set-tenant-email-domains.ts';
import { IdentityError } from '../../src/backend/rbac.ts';
import { _resetGraphCacheForTest } from '../../src/backend/sso/graph.ts';

const CLI_ACTOR = { type: 'cli' as const, user_id: null };

describe('setTenantEmailDomains', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    process.env.MICROSOFT_CLIENT_ID = 'app-id-for-tests';
    process.env.MICROSOFT_CLIENT_SECRET = 'app-secret-for-tests';
    _resetGraphCacheForTest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_SECRET;
  });

  it('normalizes and persists when the tenant has no SSO provider', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1::uuid, 'Acme', 'acme-' || $1::text)`,
            [tenantId],
          );

          const result = await setTenantEmailDomains(
            { tenant_id: tenantId, email_domains: ['Acme.COM ', 'acme.com'] },
            CLI_ACTOR,
          );

          expect(result).toEqual(['acme.com']);

          // Verify persisted via getTenantEmailDomains (from @seta/core, Task 1)
          const persisted = await getTenantEmailDomains(tenantId);
          expect(persisted).toEqual(['acme.com']);

          // Verify event was emitted
          const { rows: events } = await pool.query<{ event_type: string }>(
            `SELECT event_type FROM core.events WHERE tenant_id = $1 ORDER BY occurred_at`,
            [tenantId],
          );
          expect(events.map((e) => e.event_type)).toContain('core.tenant.email_domains.changed');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects a domain already claimed by another tenant (DOMAIN_TAKEN)', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantA = crypto.randomUUID();
          const tenantB = crypto.randomUUID();
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1::uuid, 'TenantA', 'ta-' || $1::text), ($2::uuid, 'TenantB', 'tb-' || $2::text)`,
            [tenantA, tenantB],
          );

          // Seed tenantA with email_domains via direct UPDATE
          await pool.query(
            `UPDATE core.tenants SET email_domains = ARRAY['acme.com']::text[] WHERE id = $1`,
            [tenantA],
          );

          // tenantB tries to claim acme.com
          await expect(
            setTenantEmailDomains({ tenant_id: tenantB, email_domains: ['acme.com'] }, CLI_ACTOR),
          ).rejects.toSatisfy(
            (e: unknown) => e instanceof IdentityError && e.code === 'DOMAIN_TAKEN',
          );
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('serializes concurrent claims of the same domain — exactly one wins, the other is DOMAIN_TAKEN', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantA = crypto.randomUUID();
          const tenantB = crypto.randomUUID();
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1::uuid, 'TenantA', 'race-a-' || $1::text), ($2::uuid, 'TenantB', 'race-b-' || $2::text)`,
            [tenantA, tenantB],
          );

          const results = await Promise.allSettled([
            setTenantEmailDomains({ tenant_id: tenantA, email_domains: ['race.com'] }, CLI_ACTOR),
            setTenantEmailDomains({ tenant_id: tenantB, email_domains: ['race.com'] }, CLI_ACTOR),
          ]);

          const fulfilled = results.filter((r) => r.status === 'fulfilled');
          const rejected = results.filter((r) => r.status === 'rejected');
          expect(fulfilled).toHaveLength(1);
          expect(rejected).toHaveLength(1);
          expect(
            (rejected[0] as PromiseRejectedResult).reason instanceof IdentityError &&
              (rejected[0] as PromiseRejectedResult).reason.code === 'DOMAIN_TAKEN',
          ).toBe(true);

          // Only the winning tenant actually persisted the domain — no split-brain state.
          const [aDomains, bDomains] = await Promise.all([
            getTenantEmailDomains(tenantA),
            getTenantEmailDomains(tenantB),
          ]);
          expect([aDomains, bDomains].filter((d) => d.includes('race.com'))).toHaveLength(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('requires core.tenant.update (non-admin user actor → FORBIDDEN)', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1::uuid, 'Acme', 'acme2-' || $1::text)`,
            [tenantId],
          );

          // User with no grants — lacks core.tenant.update
          const userId = crypto.randomUUID();
          const userActor = { type: 'user' as const, user_id: userId };

          await expect(
            setTenantEmailDomains({ tenant_id: tenantId, email_domains: ['acme.com'] }, userActor),
          ).rejects.toSatisfy((e: unknown) => e instanceof IdentityError && e.code === 'FORBIDDEN');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects unverified domain with DOMAIN_NOT_VERIFIED when provider present', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          const ENTRA_TID = '11111111-2222-3333-4444-555555555555';
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1::uuid, 'Acme', 'acme3-' || $1::text)`,
            [tenantId],
          );

          // Seed an SSO provider so getProviderRow returns a row
          await pool.query(
            `INSERT INTO identity.tenant_sso_providers (tenant_id, provider_id, enabled, entra_tenant_id, config)
             VALUES ($1, 'microsoft-entra-id', false, $2, $3::jsonb)`,
            [
              tenantId,
              ENTRA_TID,
              JSON.stringify({
                consent_granted_at: null,
                consent_granted_by_oid: null,
                consent_granted_by_email: null,
              }),
            ],
          );

          // Graph returns evil.com as NOT verified
          fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ access_token: 'tkn-test', expires_in: 3600 }),
          } as Response);
          fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              value: [
                { id: 'acme.com', isVerified: true },
                { id: 'evil.com', isVerified: false },
              ],
            }),
          } as Response);

          await expect(
            setTenantEmailDomains({ tenant_id: tenantId, email_domains: ['evil.com'] }, CLI_ACTOR),
          ).rejects.toSatisfy(
            (e: unknown) => e instanceof IdentityError && e.code === 'DOMAIN_NOT_VERIFIED',
          );
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('fails closed (M365_NOT_CONFIGURED) when a provider exists but the Entra linkage is null', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1::uuid, 'Acme', 'acme4-' || $1::text)`,
            [tenantId],
          );

          // Provider row exists but entra_tenant_id has NOT been projected in from integrations yet.
          await pool.query(
            `INSERT INTO identity.tenant_sso_providers (tenant_id, provider_id, enabled, config)
             VALUES ($1, 'microsoft-entra-id', false, '{}'::jsonb)`,
            [tenantId],
          );

          // Must NOT silently persist unverified domains — no Graph call should even be made.
          await expect(
            setTenantEmailDomains({ tenant_id: tenantId, email_domains: ['acme.com'] }, CLI_ACTOR),
          ).rejects.toSatisfy(
            (e: unknown) => e instanceof IdentityError && e.code === 'M365_NOT_CONFIGURED',
          );
          expect(fetchMock).not.toHaveBeenCalled();

          // And nothing was persisted.
          const persisted = await getTenantEmailDomains(tenantId);
          expect(persisted).toEqual([]);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
