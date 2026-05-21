import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildAuthProvider,
  getM365CredsForTenant,
  type M365Creds,
} from '../../../src/m365/auth.ts';
import { buildGraphClient } from '../../../src/m365/client.ts';

const fakeCreds: M365Creds = {
  tenantId: 'tenant-id',
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
    const client = buildGraphClient(fakeCreds);
    expect(client).toBeInstanceOf(Client);
  });
});

describe('getM365CredsForTenant', () => {
  afterEach(() => {
    delete process.env.M365_DEFAULT_TENANT_ID;
    delete process.env.M365_CLIENT_ID;
    delete process.env.M365_CLIENT_SECRET;
  });

  it('throws when env vars are not set', () => {
    expect(() => getM365CredsForTenant('any-tenant')).toThrow('M365 credentials not configured');
  });

  it('returns creds when env vars are present', () => {
    process.env.M365_DEFAULT_TENANT_ID = 'entra-tenant';
    process.env.M365_CLIENT_ID = 'app-id';
    process.env.M365_CLIENT_SECRET = 'secret';
    const creds = getM365CredsForTenant('seta-tenant');
    expect(creds).toEqual({
      tenantId: 'entra-tenant',
      clientId: 'app-id',
      clientSecret: 'secret',
    });
  });
});
