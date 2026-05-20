import { and, eq } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { tenantSsoProviders } from '../../db/schema.ts';
import type { IdentityEventActor } from '../../events/types.ts';
import type { MicrosoftEntraConfig, SsoProviderId } from '../../sso/config.ts';
import type { Actor } from '../domain/create-user.ts';
import { IdentityError } from '../rbac.ts';

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
  config: MicrosoftEntraConfig;
  email_domains: string[];
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
    config: row.config as MicrosoftEntraConfig,
    email_domains: row.email_domains,
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
