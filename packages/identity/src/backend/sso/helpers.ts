import { and, eq } from 'drizzle-orm';
import type { IdentityEventActor } from '../../events/types.ts';
import { identityDb } from '../db/index.ts';
import { tenantSsoProviders } from '../db/schema.ts';
import type { Actor } from '../domain/create-user.ts';
import { IdentityError } from '../rbac.ts';
import type { MicrosoftEntraConfig, SsoProviderId } from './config.ts';

export function toEventActor(actor: Actor): IdentityEventActor {
  return { type: actor.type, user_id: actor.user_id, ip: actor.ip, user_agent: actor.user_agent };
}

export function toEmitActor(actor: Actor, tenantId: string) {
  return { userId: actor.user_id ?? 'system', tenantId, ip: actor.ip, userAgent: actor.user_agent };
}

export interface ProviderRow {
  tenant_id: string;
  provider_id: SsoProviderId;
  enabled: boolean;
  // Owned by integrations, projected in via the entra-linkage subscriber. Null until the
  // tenant's M365 config has been set in integrations.
  entra_tenant_id: string | null;
  config: MicrosoftEntraConfig;
  created_at: Date;
  updated_at: Date;
}

export async function getProviderRow(
  tenantId: string,
  providerId: SsoProviderId,
): Promise<ProviderRow | null> {
  const [row] = await identityDb()
    .select()
    .from(tenantSsoProviders)
    .where(
      and(
        eq(tenantSsoProviders.tenant_id, tenantId),
        eq(tenantSsoProviders.provider_id, providerId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    tenant_id: row.tenant_id,
    provider_id: row.provider_id as SsoProviderId,
    enabled: row.enabled,
    entra_tenant_id: row.entra_tenant_id,
    config: row.config as MicrosoftEntraConfig,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function requireProviderRow(
  tenantId: string,
  providerId: SsoProviderId,
): Promise<ProviderRow> {
  const row = await getProviderRow(tenantId, providerId);
  if (!row)
    throw new IdentityError(
      'PROVIDER_NOT_FOUND',
      `No ${providerId} configured for tenant ${tenantId}`,
    );
  return row;
}
