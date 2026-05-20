import { and, eq, sql } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { tenantSsoProviders } from '../../db/schema.ts';
import type { MicrosoftEntraConfig, SsoProviderId } from '../../sso/config.ts';

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
  if (!row) return null;

  return {
    tenant_id: row.tenant_id,
    provider_id: row.provider_id as SsoProviderId,
    config: row.config as MicrosoftEntraConfig,
  };
}

export function validateEntraTid(
  seta: { config: MicrosoftEntraConfig },
  claimedTid: string,
): boolean {
  return seta.config.entra_tenant_id === claimedTid;
}
