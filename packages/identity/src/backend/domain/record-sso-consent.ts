import { emit, withEmit } from '@seta/core/events';
import { and, eq } from 'drizzle-orm';
import { tenantSsoProviders } from '../../db/schema.ts';
import type { MicrosoftEntraConfig } from '../../sso/config.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import { type ProviderRow, requireProviderRow, toEmitActor, toEventActor } from '../sso/helpers.ts';
import type { Actor } from './create-user.ts';

export interface RecordSsoConsentInput {
  tenant_id: string;
  provider_id: 'microsoft-entra-id';
  granted_by_oid?: string | null;
  granted_by_email?: string | null;
}

export async function recordSsoConsent(
  input: RecordSsoConsentInput,
  actor: Actor,
): Promise<ProviderRow> {
  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, 'identity.sso.write', input.tenant_id);
  }

  const existing = await requireProviderRow(input.tenant_id, input.provider_id);

  const updatedConfig: MicrosoftEntraConfig = {
    ...existing.config,
    consent_granted_at: new Date().toISOString(),
    consent_granted_by_oid: input.granted_by_oid ?? existing.config.consent_granted_by_oid,
    consent_granted_by_email: input.granted_by_email ?? existing.config.consent_granted_by_email,
  };

  await withEmit({ actor: toEmitActor(actor, input.tenant_id) }, async (tx) => {
    await tx
      .update(tenantSsoProviders)
      .set({ config: updatedConfig, updated_at: new Date() })
      .where(
        and(
          eq(tenantSsoProviders.tenant_id, input.tenant_id),
          eq(tenantSsoProviders.provider_id, input.provider_id),
        ),
      );

    await emit({
      tenantId: input.tenant_id,
      aggregateType: 'identity.sso_provider',
      aggregateId: `${input.tenant_id}:microsoft-entra-id`,
      eventType: 'identity.sso_provider.consent_granted',
      eventVersion: 1,
      payload: {
        actor: toEventActor(actor),
        tenant_id: input.tenant_id,
        provider_id: 'microsoft-entra-id',
        granted_by_oid: updatedConfig.consent_granted_by_oid,
        granted_by_email: updatedConfig.consent_granted_by_email,
      },
    });
  });

  const row = await requireProviderRow(input.tenant_id, input.provider_id);
  return row;
}
