import { emit, withEmit } from '@seta/core/events';
import { and, eq, ne, sql } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { tenantSsoProviders } from '../../db/schema.ts';
import type { MicrosoftEntraConfig, SsoProviderId } from '../../sso/config.ts';
import { graphGetDomains } from '../../sso/graph.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import { getProviderRow, type ProviderRow, toEmitActor, toEventActor } from '../sso/helpers.ts';
import type { Actor } from './create-user.ts';

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

  if (normalized.length === 0) {
    throw new IdentityError('NO_DOMAINS', 'At least one email domain is required');
  }

  const graphDomains = await graphGetDomains(input.entra_tenant_id);
  const verifiedSet = new Set(
    graphDomains.filter((d) => d.isVerified).map((d) => d.id.toLowerCase()),
  );
  const unverified = normalized.filter((d) => !verifiedSet.has(d));
  if (unverified.length > 0) {
    throw new IdentityError(
      'DOMAIN_NOT_VERIFIED',
      `Domains not verified in Entra tenant: ${unverified.join(', ')}`,
    );
  }

  // Cross-tenant uniqueness: reject if another tenant already claims any of these domains
  const conflicts = await identityDb()
    .select({ tenant_id: tenantSsoProviders.tenant_id })
    .from(tenantSsoProviders)
    .where(
      and(
        ne(tenantSsoProviders.tenant_id, input.tenant_id),
        eq(tenantSsoProviders.enabled, true),
        sql`${tenantSsoProviders.email_domains} && ${sql`ARRAY[${sql.join(
          normalized.map((d) => sql`${d}`),
          sql`, `,
        )}]::text[]`}`,
      ),
    )
    .limit(1);

  if (conflicts.length > 0) {
    throw new IdentityError(
      'DOMAIN_TAKEN',
      'One or more domains are already claimed by another tenant',
    );
  }

  // Preserve existing consent metadata when re-registering
  const existing = await getProviderRow(input.tenant_id, 'microsoft-entra-id');
  const config: MicrosoftEntraConfig = {
    entra_tenant_id: input.entra_tenant_id,
    consent_granted_at: existing?.config.consent_granted_at ?? null,
    consent_granted_by_oid: existing?.config.consent_granted_by_oid ?? null,
    consent_granted_by_email: existing?.config.consent_granted_by_email ?? null,
  };

  await withEmit({ actor: toEmitActor(actor, input.tenant_id) }, async (tx) => {
    await tx
      .insert(tenantSsoProviders)
      .values({
        tenant_id: input.tenant_id,
        provider_id: 'microsoft-entra-id',
        enabled: false,
        config,
        email_domains: normalized,
      })
      .onConflictDoUpdate({
        target: [tenantSsoProviders.tenant_id, tenantSsoProviders.provider_id],
        set: {
          config,
          email_domains: normalized,
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

  const row = await getProviderRow(input.tenant_id, 'microsoft-entra-id');
  if (!row) throw new IdentityError('INTERNAL', 'Provider row missing after upsert');
  return row;
}
