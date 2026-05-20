import { getProviderRow } from '../sso/helpers.ts';

/**
 * Returns the tenant's Entra tenant id, or null if no microsoft-entra-id provider is registered
 * (or registered but disabled). Consumed by shared/mailer's Graph transport via MailerDeps.
 */
export async function getEntraTenantId(tenantId: string): Promise<string | null> {
  const row = await getProviderRow(tenantId, 'microsoft-entra-id');
  if (!row?.enabled) return null;
  return row.config.entra_tenant_id ?? null;
}
