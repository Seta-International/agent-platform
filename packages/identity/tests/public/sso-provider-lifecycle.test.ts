import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disableSsoProvider,
  disconnectSsoProvider,
  enableSsoProvider,
  IdentityError,
  listSsoProviders,
  recordSsoConsent,
  registerSsoProvider,
} from '../../src/index.ts';
import { _resetGraphCacheForTest } from '../../src/sso/graph.ts';

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
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
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
            'identity.sso_provider.registered',
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

  it('rejects unverified domain with DOMAIN_NOT_VERIFIED', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
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
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantA = crypto.randomUUID();
          const tenantB = crypto.randomUUID();
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'TenantA', 'tenant-a'), ($2, 'TenantB', 'tenant-b')`,
            [tenantA, tenantB],
          );

          // Seed tenantA with an enabled provider claiming acme.com
          await pool.query(
            `INSERT INTO identity.tenant_sso_providers (tenant_id, provider_id, enabled, config, email_domains)
             VALUES ($1, 'microsoft-entra-id', true, $2::jsonb, $3)`,
            [
              tenantA,
              JSON.stringify({
                entra_tenant_id: ENTRA_TID,
                consent_granted_at: null,
                consent_granted_by_oid: null,
                consent_granted_by_email: null,
              }),
              ['acme.com'],
            ],
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
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
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
