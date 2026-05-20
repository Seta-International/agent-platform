import pino from 'pino';
import { entraSsoConfigured, parseIdentityEnv } from '../backend/env.ts';
import { IdentityError } from '../backend/rbac.ts';

const log = pino({ name: 'identity/sso/graph' });

interface CachedToken {
  access_token: string;
  expires_at: number;
}

const appTokenCache = new Map<string, CachedToken>();

export interface GraphUser {
  id: string;
  mail: string | null;
  userPrincipalName: string | null;
  displayName: string | null;
  accountEnabled: boolean;
}

async function getAppAccessToken(entraTenantId: string): Promise<string> {
  const cached = appTokenCache.get(entraTenantId);
  if (cached && cached.expires_at > Date.now() + 60_000) return cached.access_token;

  const env = parseIdentityEnv();
  if (!entraSsoConfigured(env)) {
    throw new IdentityError(
      'SSO_NOT_CONFIGURED',
      'MICROSOFT_CLIENT_ID/SECRET are not set; A2 features are disabled.',
    );
  }

  const res = await fetch(`https://login.microsoftonline.com/${entraTenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID!,
      client_secret: env.MICROSOFT_CLIENT_SECRET!,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    log.warn({ status: res.status, body }, 'graph_token_failed');
    throw new IdentityError(
      'GRAPH_TOKEN_FAILED',
      `GRAPH_TOKEN_FAILED: Microsoft token endpoint returned ${res.status}`,
    );
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  const token: CachedToken = {
    access_token: json.access_token,
    expires_at: Date.now() + json.expires_in * 1000,
  };
  appTokenCache.set(entraTenantId, token);
  return token.access_token;
}

export async function graphGetDomains(
  entraTenantId: string,
): Promise<ReadonlyArray<{ id: string; isVerified: boolean }>> {
  const token = await getAppAccessToken(entraTenantId);
  const res = await fetch('https://graph.microsoft.com/v1.0/domains', {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    log.warn({ status: res.status, body }, 'graph_domains_failed');
    throw new IdentityError(
      'GRAPH_CALL_FAILED',
      `GRAPH_CALL_FAILED: Graph /domains returned ${res.status}`,
    );
  }
  const json = (await res.json()) as { value: Array<{ id: string; isVerified: boolean }> };
  return json.value;
}

export async function graphListUsers(entraTenantId: string): Promise<ReadonlyArray<GraphUser>> {
  const token = await getAppAccessToken(entraTenantId);
  const res = await fetch(
    'https://graph.microsoft.com/v1.0/users?$select=id,mail,userPrincipalName,displayName,accountEnabled&$top=999',
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    log.warn({ status: res.status, body }, 'graph_users_failed');
    throw new IdentityError(
      'GRAPH_CALL_FAILED',
      `GRAPH_CALL_FAILED: Graph /users returned ${res.status}`,
    );
  }
  const json = (await res.json()) as { value: GraphUser[] };
  return json.value;
}

export function _resetGraphCacheForTest(): void {
  appTokenCache.clear();
}
