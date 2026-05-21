import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

export interface M365Creds {
  entraTenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface CredsProvider {
  getCreds(setaTenantId: string): Promise<M365Creds>;
}

export class M365NotConfiguredError extends Error {
  constructor(setaTenantId: string) {
    super(`M365 not configured for tenant ${setaTenantId}`);
    this.name = 'M365NotConfiguredError';
  }
}

export function buildAuthProvider(creds: M365Creds): TokenCredentialAuthenticationProvider {
  const credential = new ClientSecretCredential(
    creds.entraTenantId,
    creds.clientId,
    creds.clientSecret,
  );
  return new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });
}

export function buildDbCredsProvider(deps: {
  store: {
    get(tenantId: string): Promise<{
      entra_tenant_id: string;
      client_id: string;
      client_secret_plaintext: string;
    } | null>;
  };
}): CredsProvider {
  return {
    async getCreds(setaTenantId) {
      const row = await deps.store.get(setaTenantId);
      if (!row) throw new M365NotConfiguredError(setaTenantId);
      return {
        entraTenantId: row.entra_tenant_id,
        clientId: row.client_id,
        clientSecret: row.client_secret_plaintext,
      };
    },
  };
}
