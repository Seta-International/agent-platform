import {
  type Transport,
  TransportError,
  type TransportSendInput,
  type TransportSendResult,
} from './types.ts';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

export function _resetGraphTokenCache(): void {
  tokenCache.clear();
}

export interface GraphTransportOptions {
  entraTenantId: string;
  sender: string;
  senderDisplayName?: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}

const PERMANENT_STATUSES = new Set([400, 401, 403, 404, 405, 406, 409, 410, 422]);

export function createGraphTransport(opts: GraphTransportOptions): Transport {
  const f = opts.fetchImpl ?? fetch;
  const cacheKey = `${opts.entraTenantId}:${opts.clientId}`;

  async function getToken(): Promise<string> {
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.accessToken;
    const res = await f(
      `https://login.microsoftonline.com/${opts.entraTenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: opts.clientId,
          client_secret: opts.clientSecret,
          grant_type: 'client_credentials',
          scope: 'https://graph.microsoft.com/.default',
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new TransportError(
        'graph',
        res.status >= 500 ? 'transient' : 'permanent',
        `GRAPH_TOKEN_${res.status}`,
        `token endpoint returned ${res.status}: ${body}`,
      );
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    tokenCache.set(cacheKey, {
      accessToken: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    });
    return json.access_token;
  }

  return {
    kind: 'graph',
    async send(input: TransportSendInput): Promise<TransportSendResult> {
      const token = await getToken();
      const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(opts.sender)}/sendMail`;
      const body = {
        message: {
          subject: input.subject,
          body: { contentType: 'HTML', content: input.html },
          toRecipients: [{ emailAddress: { address: input.to } }],
          from: {
            emailAddress: {
              address: input.from,
              ...(opts.senderDisplayName ? { name: opts.senderDisplayName } : {}),
            },
          },
          ...(input.replyTo ? { replyTo: [{ emailAddress: { address: input.replyTo } }] } : {}),
        },
        saveToSentItems: true,
      };
      const res = await f(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (res.status === 202) {
        return { messageId: res.headers.get('request-id') };
      }
      const text = await res.text().catch(() => '');
      const code = `GRAPH_${res.status}`;
      const classification = PERMANENT_STATUSES.has(res.status) ? 'permanent' : 'transient';
      throw new TransportError(
        'graph',
        classification,
        code,
        `/sendMail returned ${res.status}: ${text}`,
      );
    },
  };
}
