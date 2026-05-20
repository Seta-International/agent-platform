import { emit, withEmit } from '@seta/core/events';
import { and, eq } from 'drizzle-orm';
import { tenantSsoProviders } from '../../db/schema.ts';
import type { SsoProviderId } from '../../sso/config.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import { requireProviderRow, toEmitActor, toEventActor } from '../sso/helpers.ts';
import type { Actor } from './create-user.ts';

export async function disconnectSsoProvider(
  args: { tenant_id: string; provider_id: SsoProviderId },
  actor: Actor,
): Promise<void> {
  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, 'identity.sso.write', args.tenant_id);
  }

  await requireProviderRow(args.tenant_id, args.provider_id);

  await withEmit({ actor: toEmitActor(actor, args.tenant_id) }, async (tx) => {
    await tx
      .delete(tenantSsoProviders)
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
      eventType: 'identity.sso_provider.disconnected',
      eventVersion: 1,
      payload: {
        actor: toEventActor(actor),
        tenant_id: args.tenant_id,
        provider_id: args.provider_id,
      },
    });
  });
}
