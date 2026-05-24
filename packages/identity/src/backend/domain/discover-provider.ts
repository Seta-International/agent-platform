// rbac: public-endpoint — pre-auth SSO provider lookup keyed off an email address.
// No session exists yet; the result drives the login form's redirect.
import type { SsoProviderId } from '../sso/config.ts';
import { resolveSetaTenantFromEmail } from '../sso/tenant-resolution.ts';

export interface DiscoverResult {
  provider_id: 'credential' | SsoProviderId;
  redirect_url?: string;
  tenant_id?: string;
}

export async function discoverProvider(email: string): Promise<DiscoverResult> {
  const seta = await resolveSetaTenantFromEmail(email);
  if (!seta) return { provider_id: 'credential' };
  const callback = encodeURIComponent('/');
  return {
    provider_id: seta.provider_id,
    tenant_id: seta.tenant_id,
    redirect_url: `/api/identity/v1/auth/sign-in/social?provider=microsoft&callbackURL=${callback}`,
  };
}
