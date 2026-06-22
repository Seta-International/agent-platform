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

  const result = await identityDb().execute<{
    tenant_id: string;
    provider_id: string;
    config: MicrosoftEntraConfig;
  }>(sql`
    SELECT p.tenant_id, p.provider_id, p.config
    FROM core.tenants t -- cross-schema-read: core.tenants owns email_domains; identity joins it for pre-auth SSO routing.
    JOIN identity.tenant_sso_providers p ON p.tenant_id = t.id AND p.enabled = true
    WHERE ${domain} = ANY(t.email_domains)
    LIMIT 1
  `);
  const row = result.rows[0];
  if (row) {
    return {
      tenant_id: row.tenant_id,
      provider_id: row.provider_id as SsoProviderId,
      config: row.config,
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
