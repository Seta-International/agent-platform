import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAdminConsentUrl } from '../../src/backend/sso/consent-url.ts';

describe('buildAdminConsentUrl', () => {
  beforeEach(() => {
    process.env.MICROSOFT_CLIENT_ID = 'app-id';
    process.env.MICROSOFT_CLIENT_SECRET = 'app-secret';
    process.env.BETTER_AUTH_SECRET = 'x'.repeat(64);
  });
  afterEach(() => {
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_SECRET;
    delete process.env.BETTER_AUTH_SECRET;
  });

  it('includes scopes, client_id, state, redirect_uri', () => {
    const url = new URL(
      buildAdminConsentUrl({
        entraTenantId: '11111111-2222-3333-4444-555555555555',
        state: 'csrf-token',
        redirectUri: 'http://localhost:3000/api/identity/v1/sso/consent/microsoft/callback',
      }),
    );
    expect(url.host).toBe('login.microsoftonline.com');
    expect(url.pathname).toBe('/11111111-2222-3333-4444-555555555555/v2.0/adminconsent');
    expect(url.searchParams.get('client_id')).toBe('app-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/identity/v1/sso/consent/microsoft/callback',
    );
    expect(url.searchParams.get('scope')).toContain('Domain.Read.All');
    expect(url.searchParams.get('scope')).toContain('User.Read.All');
    expect(url.searchParams.get('state')).toBe('csrf-token');
  });
});
