import { emit, withEmit } from '@seta/core/events';
import { and, eq } from 'drizzle-orm';
import { tenantSsoProviders } from '../../db/schema.ts';
import type { SsoProviderId } from '../../sso/config.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import { type ProviderRow, requireProviderRow, toEmitActor, toEventActor } from '../sso/helpers.ts';
import type { Actor } from './create-user.ts';

export async function disableSsoProvider(
  args: { tenant_id: string; provider_id: SsoProviderId },
  actor: Actor,
): Promise<ProviderRow> {
  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, 'identity.sso.write', args.tenant_id);
  }

  const row = await requireProviderRow(args.tenant_id, args.provider_id);

  if (!row.enabled) return row;

  await withEmit({ actor: toEmitActor(actor, args.tenant_id) }, async (tx) => {
    await tx
      .update(tenantSsoProviders)
      .set({ enabled: false, updated_at: new Date() })
      .where(
        and(
          eq(tenantSsoProviders.tenant_id, args.tenant_id),
          eq(tenantSsoProviders.provider_id, args.provider_id),
        ),
      );

    await emit({
      tenantId: args.tenant_id,
      aggregateType: 'identity.sso_provider',
      aggregateId: `${args.tenant_id}:${args.provider_id}`,
      eventType: 'identity.sso_provider.disabled',
      eventVersion: 1,
      payload: {
        actor: toEventActor(actor),
        tenant_id: args.tenant_id,
        provider_id: args.provider_id,
      },
    });
  });

  return requireProviderRow(args.tenant_id, args.provider_id);
}
