import { IdentityError, requirePermission } from '../rbac.ts';
import { graphGetDomains } from '../sso/graph.ts';
import { type ProviderRow, requireProviderRow } from '../sso/helpers.ts';
import type { Actor } from './create-user.ts';
import { recordSsoConsent } from './record-sso-consent.ts';

export interface SyncSsoConsentInput {
  tenant_id: string;
  provider_id: 'microsoft-entra-id';
}

/**
 * Tenant admins can grant admin consent directly in the Entra admin center (App
 * registrations → API permissions), bypassing our own /v2.0/adminconsent redirect. That
 * path never calls back into recordSsoConsent, so consent_granted_at stays null even
 * though Microsoft already holds the grant. Ask Microsoft directly instead of trusting
 * only our own callback: an app-only Graph call that needs the Domain.Read.All
 * (Application) permission succeeds only once consent has actually been granted, no
 * matter which UI was used to grant it.
 */
export async function syncSsoConsentFromGraph(
  input: SyncSsoConsentInput,
  actor: Actor,
): Promise<ProviderRow> {
  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, 'identity.sso.update', input.tenant_id);
  }

  const row = await requireProviderRow(input.tenant_id, input.provider_id);
  if (row.config.consent_granted_at) return row;
  if (!row.entra_tenant_id) return row;

  try {
    await graphGetDomains(row.entra_tenant_id);
  } catch {
    return row;
  }

  return recordSsoConsent(
    { tenant_id: input.tenant_id, provider_id: input.provider_id },
    { type: 'system', user_id: null },
  );
}
