import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createUser,
  enableSsoProvider,
  importUsersFromEntra,
  listEntraImportableUsers,
  recordSsoConsent,
  registerSsoProvider,
} from '../../src/index.ts';
import { _resetGraphCacheForTest } from '../../src/sso/graph.ts';

const ENTRA_TID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CLI_ACTOR = { type: 'cli' as const, user_id: null };

// Graph users returned by the mock: alice (already in Seta), bob (new),
// carol_disabled (account_enabled=false), dave (new)
const GRAPH_USERS = [
  {
    id: 'oid-alice',
    mail: 'alice@acme.com',
    userPrincipalName: null,
    displayName: 'Alice Admin',
    accountEnabled: true,
  },
  {
    id: 'oid-bob',
    mail: 'bob@acme.com',
    userPrincipalName: null,
    displayName: 'Bob Builder',
    accountEnabled: true,
  },
  {
    id: 'oid-carol',
    mail: 'carol@acme.com',
    userPrincipalName: null,
    displayName: 'Carol Disabled',
    accountEnabled: false,
  },
  {
    id: 'oid-dave',
    mail: null,
    userPrincipalName: 'dave@acme.com',
    displayName: 'Dave UPN',
    accountEnabled: true,
  },
];

function mockGraphFull(fetchMock: ReturnType<typeof vi.fn>) {
  // Token for registerSsoProvider (discover domains)
  fetchMock.mockImplementation((url: string, _opts?: unknown) => {
    if (typeof url === 'string' && url.includes('/oauth2/v2.0/token')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ access_token: 'tkn-test', expires_in: 3600 }),
      } as Response);
    }
    if (typeof url === 'string' && url.includes('/domains')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          value: [{ id: 'acme.com', isVerified: true }],
        }),
      } as Response);
    }
    if (typeof url === 'string' && url.includes('/users')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ value: GRAPH_USERS }),
      } as Response);
    }
    return Promise.resolve({ ok: false, status: 404, text: async () => '' } as Response);
  });
}

describe('@seta/identity importUsersFromEntra', () => {
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

  it('listEntraImportableUsers annotates already_in_seta correctly', async () => {
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

          mockGraphFull(fetchMock);

          // Register + consent + enable provider
          await registerSsoProvider(
            {
              tenant_id: tenantId,
              provider_id: 'microsoft-entra-id',
              entra_tenant_id: ENTRA_TID,
              email_domains: ['acme.com'],
            },
            CLI_ACTOR,
          );
          await recordSsoConsent(
            {
              tenant_id: tenantId,
              provider_id: 'microsoft-entra-id',
              granted_by_oid: 'oid-global-admin',
              granted_by_email: 'admin@acme.com',
            },
            CLI_ACTOR,
          );
          await enableSsoProvider(
            { tenant_id: tenantId, provider_id: 'microsoft-entra-id' },
            CLI_ACTOR,
          );

          // Pre-create alice as an existing Seta user
          await createUser(
            {
              tenant_id: tenantId,
              email: 'alice@acme.com',
              name: 'Alice Admin',
              password: 'SomePassword1234!',
            },
            CLI_ACTOR,
          );

          _resetGraphCacheForTest();
          mockGraphFull(fetchMock);

          const importable = await listEntraImportableUsers(tenantId);

          // All 4 Graph users are returned (including disabled)
          expect(importable).toHaveLength(4);

          const alice = importable.find((u) => u.entra_oid === 'oid-alice');
          expect(alice?.already_in_seta).toBe(true);
          expect(alice?.account_enabled).toBe(true);

          const bob = importable.find((u) => u.entra_oid === 'oid-bob');
          expect(bob?.already_in_seta).toBe(false);
          expect(bob?.account_enabled).toBe(true);

          const carol = importable.find((u) => u.entra_oid === 'oid-carol');
          expect(carol?.already_in_seta).toBe(false);
          expect(carol?.account_enabled).toBe(false);

          const dave = importable.find((u) => u.entra_oid === 'oid-dave');
          expect(dave?.already_in_seta).toBe(false);
          expect(dave?.email).toBe('dave@acme.com');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('importUsersFromEntra: imports bob+dave; skips carol (disabled) and alice (already_in_seta)', async () => {
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
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Acme', 'acme2')`,
            [tenantId],
          );

          mockGraphFull(fetchMock);

          await registerSsoProvider(
            {
              tenant_id: tenantId,
              provider_id: 'microsoft-entra-id',
              entra_tenant_id: ENTRA_TID,
              email_domains: ['acme.com'],
            },
            CLI_ACTOR,
          );
          await recordSsoConsent(
            {
              tenant_id: tenantId,
              provider_id: 'microsoft-entra-id',
              granted_by_oid: 'oid-global-admin',
              granted_by_email: 'admin@acme.com',
            },
            CLI_ACTOR,
          );
          await enableSsoProvider(
            { tenant_id: tenantId, provider_id: 'microsoft-entra-id' },
            CLI_ACTOR,
          );

          // Pre-create alice
          await createUser(
            {
              tenant_id: tenantId,
              email: 'alice@acme.com',
              name: 'Alice Admin',
              password: 'SomePassword1234!',
            },
            CLI_ACTOR,
          );

          _resetGraphCacheForTest();
          mockGraphFull(fetchMock);

          // Select all 4 OIDs — carol is disabled and will be filtered, alice is already_in_seta
          const result = await importUsersFromEntra(
            {
              tenant_id: tenantId,
              selected_oids: ['oid-alice', 'oid-bob', 'oid-carol', 'oid-dave'],
            },
            CLI_ACTOR,
          );

          // bob + dave should be imported (carol filtered because account_enabled=false,
          // alice skipped because already_in_seta)
          expect(result.imported).toHaveLength(2);
          expect(result.skipped).toHaveLength(1);
          expect(result.skipped[0]).toMatchObject({
            entra_oid: 'oid-alice',
            reason: 'already_exists',
          });

          // Verify the newly created users exist in DB
          const { rows } = await pool.query<{ email: string }>(
            `SELECT email FROM identity."user" WHERE tenant_id = $1 ORDER BY email`,
            [tenantId],
          );
          const emails = rows.map((r) => r.email);
          expect(emails).toContain('bob@acme.com');
          expect(emails).toContain('dave@acme.com');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
