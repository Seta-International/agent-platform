import { and, eq, sql } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { tenantSsoProviders, user } from '../db/schema.ts';
import type { MicrosoftEntraConfig, SsoProviderId } from './config.ts';

export interface ResolvedSetaTenant {
  tenant_id: string;
  provider_id: SsoProviderId;
  config: MicrosoftEntraConfig;
}

export async function resolveSetaTenantFromEmail(
  email: string,
): Promise<ResolvedSetaTenant | null> {
  const at = email.indexOf('@');
  if (at < 0) return null;
  const domain = email
    .slice(at + 1)
    .toLowerCase()
    .trim();
  if (!domain) return null;

  const [row] = await identityDb()
    .select({
      tenant_id: tenantSsoProviders.tenant_id,
      provider_id: tenantSsoProviders.provider_id,
      config: tenantSsoProviders.config,
    })
    .from(tenantSsoProviders)
    .where(
      and(
        eq(tenantSsoProviders.enabled, true),
        sql`${domain} = ANY(${tenantSsoProviders.email_domains})`,
      ),
    )
    .limit(1);
  if (row) {
    return {
      tenant_id: row.tenant_id,
      provider_id: row.provider_id as SsoProviderId,
      config: row.config as MicrosoftEntraConfig,
    };
  }

  // Fallback for environments where email-domain mapping is not yet populated:
  // if the user is pre-provisioned and their tenant has an enabled SSO provider,
  // use that provider for discovery.
  const normalizedEmail = email.toLowerCase().trim();
  const [fallback] = await identityDb()
    .select({
      tenant_id: tenantSsoProviders.tenant_id,
      provider_id: tenantSsoProviders.provider_id,
      config: tenantSsoProviders.config,
    })
    .from(user)
    .innerJoin(tenantSsoProviders, eq(user.tenant_id, tenantSsoProviders.tenant_id))
    .where(
      and(
        eq(tenantSsoProviders.enabled, true),
        eq(tenantSsoProviders.provider_id, 'microsoft-entra-id'),
        sql`lower(${user.email}) = ${normalizedEmail}`,
      ),
    )
    .limit(1);

  if (!fallback) return null;
  return {
    tenant_id: fallback.tenant_id,
    provider_id: fallback.provider_id as SsoProviderId,
    config: fallback.config as MicrosoftEntraConfig,
  };
}

export function validateEntraTid(
  seta: { config: MicrosoftEntraConfig },
  claimedTid: string,
): boolean {
  return seta.config.entra_tenant_id === claimedTid;
}
