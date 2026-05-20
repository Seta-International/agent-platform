import { parseIdentityEnv } from '../env.ts';

const SCOPES = ['openid', 'profile', 'email', 'Domain.Read.All', 'User.Read.All'];

export function buildAdminConsentUrl(opts: {
  entraTenantId: string;
  state: string;
  redirectUri: string;
}): string {
  const env = parseIdentityEnv();
  const url = new URL(`https://login.microsoftonline.com/${opts.entraTenantId}/v2.0/adminconsent`);
  url.searchParams.set('client_id', env.MICROSOFT_CLIENT_ID!);
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('redirect_uri', opts.redirectUri);
  url.searchParams.set('state', opts.state);
  return url.toString();
}
