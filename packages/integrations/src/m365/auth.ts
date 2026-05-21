import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

export interface M365Creds {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export function buildAuthProvider(creds: M365Creds): TokenCredentialAuthenticationProvider {
  const credential = new ClientSecretCredential(creds.tenantId, creds.clientId, creds.clientSecret);
  return new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });
}

export function getM365CredsForTenant(_setaTenantId: string): M365Creds {
  const tenantId = process.env.M365_DEFAULT_TENANT_ID;
  const clientId = process.env.M365_CLIENT_ID;
  const clientSecret = process.env.M365_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'M365 credentials not configured: set M365_DEFAULT_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET',
    );
  }
  return { tenantId, clientId, clientSecret };
}
