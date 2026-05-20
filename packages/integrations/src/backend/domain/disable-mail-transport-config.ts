import { emit, withEmit } from '@seta/core/events';
import { eq, sql } from 'drizzle-orm';
import { mailTransportConfig } from '../../db/schema/index.ts';
import { INTEGRATIONS_PERMISSIONS, IntegrationsError } from '../rbac.ts';
import type { Actor } from './get-mail-transport-config.ts';

export interface DisableMailTransportConfigArgs {
  tenantId: string;
  actor: Actor;
}

export async function disableMailTransportConfig(
  args: DisableMailTransportConfigArgs,
): Promise<void> {
  if (!args.actor.permissions.has(INTEGRATIONS_PERMISSIONS.mailConfigure)) {
    throw new IntegrationsError(
      'FORBIDDEN',
      `missing permission ${INTEGRATIONS_PERMISSIONS.mailConfigure}`,
    );
  }
  if (args.actor.tenantId !== args.tenantId)
    throw new IntegrationsError('FORBIDDEN', 'tenant mismatch');

  await withEmit(
    { actor: { userId: String(args.actor.user_id), tenantId: args.tenantId } },
    async (tx) => {
      await tx
        .update(mailTransportConfig)
        .set({ enabled: false, updatedAt: sql`now()`, updatedBy: args.actor.user_id })
        .where(eq(mailTransportConfig.tenantId, args.tenantId));
      await emit({
        tenantId: args.tenantId,
        aggregateType: 'mail_transport_config',
        aggregateId: args.tenantId,
        eventType: 'integrations.mail_transport.disabled',
        eventVersion: 1,
        payload: {},
      });
    },
  );
}
