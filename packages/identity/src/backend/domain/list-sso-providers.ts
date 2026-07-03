import { getTenantEmailDomains } from '@seta/core';
import { eq } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { tenantSsoProviders } from '../db/schema.ts';
import type { MicrosoftEntraConfig, SsoProviderId } from '../sso/config.ts';
import type { ProviderRow } from '../sso/helpers.ts';

export interface SsoProviderDto extends ProviderRow {
  email_domains: string[];
}

export async function listSsoProviders(tenantId: string): Promise<ReadonlyArray<SsoProviderDto>> {
  const rows = await identityDb()
    .select()
    .from(tenantSsoProviders)
    .where(eq(tenantSsoProviders.tenant_id, tenantId));

  // email_domains now live on core.tenants; surface them in the DTO so web-admin is unaffected.
  const email_domains = await getTenantEmailDomains(tenantId);

  return rows.map((row) => ({
    tenant_id: row.tenant_id,
    provider_id: row.provider_id as SsoProviderId,
    enabled: row.enabled,
    entra_tenant_id: row.entra_tenant_id,
    config: row.config as MicrosoftEntraConfig,
    email_domains,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}
