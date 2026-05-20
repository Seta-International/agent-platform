import { eq } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { tenantSsoProviders } from '../../db/schema.ts';
import type { MicrosoftEntraConfig, SsoProviderId } from '../../sso/config.ts';
import type { ProviderRow } from '../sso/helpers.ts';

export async function listSsoProviders(tenantId: string): Promise<ReadonlyArray<ProviderRow>> {
  const rows = await identityDb()
    .select()
    .from(tenantSsoProviders)
    .where(eq(tenantSsoProviders.tenant_id, tenantId));

  return rows.map((row) => ({
    tenant_id: row.tenant_id,
    provider_id: row.provider_id as SsoProviderId,
    enabled: row.enabled,
    config: row.config as MicrosoftEntraConfig,
    email_domains: row.email_domains,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}
