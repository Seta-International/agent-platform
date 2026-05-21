import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { describe, expect, it } from 'vitest';
import {
  buildAuthProvider,
  buildDbCredsProvider,
  type M365Creds,
  M365NotConfiguredError,
} from '../../../src/m365/auth.ts';
import { buildGraphClient } from '../../../src/m365/client.ts';

const fakeCreds: M365Creds = {
  entraTenantId: 'entra-tenant-id',
  clientId: 'client-id',
  clientSecret: 'client-secret',
};

describe('buildAuthProvider', () => {
  it('returns a TokenCredentialAuthenticationProvider', () => {
    const provider = buildAuthProvider(fakeCreds);
    expect(provider).toBeInstanceOf(TokenCredentialAuthenticationProvider);
  });
});

describe('buildGraphClient', () => {
  it('returns a Client instance', () => {
    const client = buildGraphClient(fakeCreds, 'seta-tenant-test');
    expect(client).toBeInstanceOf(Client);
  });
});

describe('buildDbCredsProvider', () => {
  it('returns creds when store has a row', async () => {
    const provider = buildDbCredsProvider({
      store: {
        async get(_tenantId) {
          return {
            entra_tenant_id: 'entra-abc',
            client_id: 'app-xyz',
            client_secret_plaintext: 'my-secret',
          };
        },
      },
    });
    const creds = await provider.getCreds('seta-tenant-1');
    expect(creds).toEqual({
      entraTenantId: 'entra-abc',
      clientId: 'app-xyz',
      clientSecret: 'my-secret',
    });
  });

  it('throws M365NotConfiguredError when store returns null', async () => {
    const provider = buildDbCredsProvider({
      store: {
        async get(_tenantId) {
          return null;
        },
      },
    });
    await expect(provider.getCreds('missing-tenant')).rejects.toBeInstanceOf(
      M365NotConfiguredError,
    );
    await expect(provider.getCreds('missing-tenant')).rejects.toMatchObject({
      message: 'M365 not configured for tenant missing-tenant',
    });
  });
});
