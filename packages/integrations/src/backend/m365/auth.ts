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

/**
 * AADSTS codes that mean the stored credential itself is wrong, so no number of retries can help:
 * a bad or expired secret, an app or tenant Entra does not know. Deliberately narrow — anything
 * absent here (throttling, an expired *grant*, transport faults) stays retryable.
 */
const PERMANENT_AADSTS_CODES = [
  '7000215', // invalid client secret
  '7000222', // client secret expired
  '700016', // application not found in directory
  '700027', // client assertion failed signature validation
  '90002', // tenant not found
];

/** Flattens an error chain into one searchable string; Graph nests the AADSTS body in `cause`. */
function errorText(err: unknown, depth = 0): string {
  if (err == null || depth > 4) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) {
    return `${err.message} ${errorText(err.cause, depth + 1)}`;
  }
  return String(err);
}

/**
 * True when a Graph auth failure is a configuration fault rather than a transient one.
 *
 * `m365.directory.pull` runs at `max_attempts: 25`; without this the operator-visible symptom of a
 * mis-pasted secret is 25 identical failures spread over backoff, each rewriting
 * `directory_last_error`. The caller stops the job instead, leaving the recorded error for
 * `GET /directory/status` to surface.
 */
export function isPermanentAuthError(err: unknown): boolean {
  const text = errorText(err);
  if (text === '') return false;
  if (PERMANENT_AADSTS_CODES.some((code) => text.includes(`AADSTS${code}`))) return true;
  // `invalid_client` is the OAuth-level equivalent and arrives even when the AADSTS body is
  // truncated; it always means the client credential was rejected outright.
  return /\binvalid_client\b/i.test(text);
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
