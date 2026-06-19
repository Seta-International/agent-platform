import { emit, withEmit } from '@seta/core/events';
import { tenantSsoProviders } from '../db/schema.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import type { MicrosoftEntraConfig, SsoProviderId } from '../sso/config.ts';
import { getProviderRow, type ProviderRow, toEmitActor, toEventActor } from '../sso/helpers.ts';
import type { Actor } from './create-user.ts';
import { setTenantEmailDomains } from './set-tenant-email-domains.ts';

export interface RegisterSsoProviderInput {
  tenant_id: string;
  provider_id: SsoProviderId;
  entra_tenant_id: string;
  email_domains: string[];
}

export async function registerSsoProvider(
  input: RegisterSsoProviderInput,
  actor: Actor,
): Promise<ProviderRow> {
  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, 'identity.sso.write', input.tenant_id);
  }

  if (input.provider_id !== 'microsoft-entra-id') {
    throw new IdentityError(
      'UNSUPPORTED_PROVIDER',
      `Unsupported SSO provider: ${input.provider_id}`,
    );
  }

  const normalized = Array.from(
    new Set(input.email_domains.map((d) => d.toLowerCase().trim()).filter(Boolean)),
  ).sort();

  // Preserve existing consent metadata when re-registering
  const existing = await getProviderRow(input.tenant_id, 'microsoft-entra-id');
  const config: MicrosoftEntraConfig = {
    entra_tenant_id: input.entra_tenant_id,
    consent_granted_at: existing?.config.consent_granted_at ?? null,
    consent_granted_by_oid: existing?.config.consent_granted_by_oid ?? null,
    consent_granted_by_email: existing?.config.consent_granted_by_email ?? null,
  };

  // Upsert the provider row (disabled, domain-less) and emit registered in one transaction.
  await withEmit({ actor: toEmitActor(actor, input.tenant_id) }, async (tx) => {
    await tx
      .insert(tenantSsoProviders)
      .values({
        tenant_id: input.tenant_id,
        provider_id: 'microsoft-entra-id',
        enabled: false,
        config,
      })
      .onConflictDoUpdate({
        target: [tenantSsoProviders.tenant_id, tenantSsoProviders.provider_id],
        set: {
          config,
          updated_at: new Date(),
        },
      });

    await emit({
      tenantId: input.tenant_id,
      aggregateType: 'identity.sso_provider',
      aggregateId: `${input.tenant_id}:microsoft-entra-id`,
      eventType: 'identity.sso_provider.registered',
      eventVersion: 1,
      payload: {
        actor: toEventActor(actor),
        after: {
          tenant_id: input.tenant_id,
          provider_id: 'microsoft-entra-id',
          entra_tenant_id: input.entra_tenant_id,
          email_domains: normalized,
        },
      },
    });
  });

  // Persist domains to core.tenants via the single guarded writer (verifies against Entra,
  // enforces cross-tenant uniqueness, emits core.tenant.email_domains.changed). Separate
  // transaction because setTenantEmailDomains opens its own withEmit and must see the provider
  // row to read its entra_tenant_id for Graph verification.
  await setTenantEmailDomains(
    { tenant_id: input.tenant_id, email_domains: input.email_domains },
    actor,
  );

  const row = await getProviderRow(input.tenant_id, 'microsoft-entra-id');
  if (!row) throw new IdentityError('INTERNAL', 'Provider row missing after upsert');
  return row;
}
