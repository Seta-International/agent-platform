import { getTenantEmailDomains } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetGraphCacheForTest } from '../../../src/backend/sso/graph.ts';
import {
  disableSsoProvider,
  disconnectSsoProvider,
  enableSsoProvider,
  IdentityError,
  listSsoProviders,
  recordSsoConsent,
  registerSsoProvider,
} from '../../../src/index.ts';

const ENTRA_TID = '11111111-2222-3333-4444-555555555555';
const CLI_ACTOR = { type: 'cli' as const, user_id: null };

function mockGraphHappy(fetchMock: ReturnType<typeof vi.fn>) {
  // Token
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ access_token: 'tkn-test', expires_in: 3600 }),
  } as Response);
  // Domains
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      value: [
        { id: 'acme.com', isVerified: true },
        { id: 'acme.co.uk', isVerified: true },
      ],
    }),
  } as Response);
}

describe('@seta/identity SSO provider lifecycle', () => {
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

  it('register → consent → enable → disable → disconnect emits all 5 events in order', async () => {
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
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Acme', 'acme')`,
            [tenantId],
          );

          mockGraphHappy(fetchMock);
          await registerSsoProvider(
            {
              tenant_id: tenantId,
              provider_id: 'microsoft-entra-id',
              entra_tenant_id: ENTRA_TID,
              email_domains: ['acme.com', 'acme.co.uk'],
            },
            CLI_ACTOR,
          );

          await recordSsoConsent(
            {
              tenant_id: tenantId,
              provider_id: 'microsoft-entra-id',
              granted_by_oid: 'oid-admin',
              granted_by_email: 'admin@acme.com',
            },
            CLI_ACTOR,
          );

          await enableSsoProvider(
            { tenant_id: tenantId, provider_id: 'microsoft-entra-id' },
            CLI_ACTOR,
          );
          await disableSsoProvider(
            { tenant_id: tenantId, provider_id: 'microsoft-entra-id' },
            CLI_ACTOR,
          );
          await disconnectSsoProvider(
            { tenant_id: tenantId, provider_id: 'microsoft-entra-id' },
            CLI_ACTOR,
          );

          // All 5 events in order
          const { rows: events } = await pool.query<{ event_type: string }>(
            `SELECT event_type FROM core.events WHERE tenant_id = $1 ORDER BY occurred_at, id`,
            [tenantId],
          );
          expect(events.map((e) => e.event_type)).toEqual([
            // register now persists domains to core.tenants via setTenantEmailDomains,
            // which emits core.tenant.email_domains.changed right after the registered event.
            'identity.sso_provider.registered',
            'core.tenant.email_domains.changed',
            'identity.sso_provider.consent_granted',
            'identity.sso_provider.enabled',
            'identity.sso_provider.disabled',
            'identity.sso_provider.disconnected',
          ]);

          // listSsoProviders returns empty after disconnect
          const providers = await listSsoProviders(tenantId);
          expect(providers).toHaveLength(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('registers with no domains: provider row exists, email domains stay empty', async () => {
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
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'NoDomains', 'no-domains')`,
            [tenantId],
          );

          // No Graph calls expected: an empty domain list skips Entra verification.
          const row = await registerSsoProvider(
            {
              tenant_id: tenantId,
              provider_id: 'microsoft-entra-id',
              entra_tenant_id: ENTRA_TID,
              email_domains: [],
            },
            CLI_ACTOR,
          );

          expect(row.provider_id).toBe('microsoft-entra-id');
          expect(row.enabled).toBe(false);

          const providers = await listSsoProviders(tenantId);
          expect(providers).toHaveLength(1);

          const domains = await getTenantEmailDomains(tenantId);
          expect(domains).toEqual([]);

          expect(fetchMock).not.toHaveBeenCalled();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects unverified domain with DOMAIN_NOT_VERIFIED', async () => {
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
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Acme2', 'acme2')`,
            [tenantId],
          );

          // Mock token
          fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ access_token: 'tkn-test', expires_in: 3600 }),
          } as Response);
          // Domains — only acme.com is verified, not evil.com
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
            registerSsoProvider(
              {
                tenant_id: tenantId,
                provider_id: 'microsoft-entra-id',
                entra_tenant_id: ENTRA_TID,
                email_domains: ['evil.com'],
              },
              CLI_ACTOR,
            ),
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

  it('rejects cross-tenant domain conflict with DOMAIN_TAKEN', async () => {
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
          // tenantA already claims acme.com on core.tenants (where email_domains now live).
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug, email_domains) VALUES ($1, 'TenantA', 'tenant-a', $3), ($2, 'TenantB', 'tenant-b', '{}')`,
            [tenantA, tenantB, ['acme.com']],
          );

          // tenantB tries to register with acme.com
          mockGraphHappy(fetchMock);
          await expect(
            registerSsoProvider(
              {
                tenant_id: tenantB,
                provider_id: 'microsoft-entra-id',
                entra_tenant_id: ENTRA_TID,
                email_domains: ['acme.com'],
              },
              CLI_ACTOR,
            ),
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

  it('rejects enable without consent with CONSENT_NOT_GRANTED', async () => {
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
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'NoConsent', 'no-consent')`,
            [tenantId],
          );

          mockGraphHappy(fetchMock);
          await registerSsoProvider(
            {
              tenant_id: tenantId,
              provider_id: 'microsoft-entra-id',
              entra_tenant_id: ENTRA_TID,
              email_domains: ['acme.com'],
            },
            CLI_ACTOR,
          );

          await expect(
            enableSsoProvider(
              { tenant_id: tenantId, provider_id: 'microsoft-entra-id' },
              CLI_ACTOR,
            ),
          ).rejects.toSatisfy(
            (e: unknown) => e instanceof IdentityError && e.code === 'CONSENT_NOT_GRANTED',
          );
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
