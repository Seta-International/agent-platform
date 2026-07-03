import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncSsoConsentFromGraph } from '../../../src/backend/domain/sync-sso-consent.ts';
import { _resetGraphCacheForTest } from '../../../src/backend/sso/graph.ts';
import { registerSsoProvider } from '../../../src/index.ts';

const ENTRA_TID = '11111111-2222-3333-4444-555555555555';
const CLI_ACTOR = { type: 'cli' as const, user_id: null };

function mockGraphToken(fetchMock: ReturnType<typeof vi.fn>) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ access_token: 'tkn-test', expires_in: 3600 }),
  } as Response);
}

describe('syncSsoConsentFromGraph', () => {
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

  it('marks consent granted when Graph confirms the app-only grant, even though our OAuth callback never ran', async () => {
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

          // Registration itself calls Graph once to verify domains.
          mockGraphToken(fetchMock);
          fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ value: [{ id: 'acme.com', isVerified: true }] }),
          } as Response);
          await registerSsoProvider(
            {
              tenant_id: tenantId,
              provider_id: 'microsoft-entra-id',
              entra_tenant_id: ENTRA_TID,
              email_domains: ['acme.com'],
            },
            CLI_ACTOR,
          );

          // Consent was granted directly in the Entra admin center, so the app-only Graph
          // call now succeeds even though recordSsoConsent was never called. The app token
          // from registration is still cached (same Entra tenant), so only the domains
          // response needs queuing here.
          fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ value: [{ id: 'acme.com', isVerified: true }] }),
          } as Response);

          const row = await syncSsoConsentFromGraph(
            { tenant_id: tenantId, provider_id: 'microsoft-entra-id' },
            CLI_ACTOR,
          );

          expect(row.config.consent_granted_at).not.toBeNull();

          const { rows: events } = await pool.query<{ event_type: string }>(
            `SELECT event_type FROM core.events WHERE tenant_id = $1 ORDER BY occurred_at, id`,
            [tenantId],
          );
          expect(events.map((e) => e.event_type)).toContain(
            'identity.sso_provider.consent_granted',
          );
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('leaves consent pending when Microsoft has not actually granted it yet', async () => {
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

          mockGraphToken(fetchMock);
          fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ value: [{ id: 'acme.com', isVerified: true }] }),
          } as Response);
          await registerSsoProvider(
            {
              tenant_id: tenantId,
              provider_id: 'microsoft-entra-id',
              entra_tenant_id: ENTRA_TID,
              email_domains: ['acme.com'],
            },
            CLI_ACTOR,
          );

          // Admin consent still not granted at Microsoft's side: app-only Graph call fails.
          // The app token from registration is still cached, so only the domains call fails.
          fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 403,
            text: async () => 'consent_required',
          } as Response);

          const row = await syncSsoConsentFromGraph(
            { tenant_id: tenantId, provider_id: 'microsoft-entra-id' },
            CLI_ACTOR,
          );

          expect(row.config.consent_granted_at).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('is a no-op and makes no Graph call when consent is already recorded', async () => {
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
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Already', 'already')`,
            [tenantId],
          );

          mockGraphToken(fetchMock);
          fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ value: [{ id: 'acme.com', isVerified: true }] }),
          } as Response);
          await registerSsoProvider(
            {
              tenant_id: tenantId,
              provider_id: 'microsoft-entra-id',
              entra_tenant_id: ENTRA_TID,
              email_domains: ['acme.com'],
            },
            CLI_ACTOR,
          );

          const { recordSsoConsent } = await import('../../../src/index.ts');
          await recordSsoConsent(
            { tenant_id: tenantId, provider_id: 'microsoft-entra-id' },
            CLI_ACTOR,
          );

          fetchMock.mockClear();
          const row = await syncSsoConsentFromGraph(
            { tenant_id: tenantId, provider_id: 'microsoft-entra-id' },
            CLI_ACTOR,
          );

          expect(row.config.consent_granted_at).not.toBeNull();
          expect(fetchMock).not.toHaveBeenCalled();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
