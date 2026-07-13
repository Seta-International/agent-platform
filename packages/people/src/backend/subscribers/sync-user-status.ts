import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { and, eq } from 'drizzle-orm';
import { userProjection } from '../db/schema.ts';

interface UserDeactivatedPayload {
  user_id: string;
  tenant_id: string;
  deactivated_at: string;
}

interface UserReactivatedPayload {
  user_id: string;
  tenant_id: string;
}

export const userDeactivatedSynced: SubscriberDef = {
  subscription: 'people.user-status.deactivated',
  event: 'identity.user.deactivated',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<UserDeactivatedPayload>;
    const { user_id, tenant_id, deactivated_at } = e.payload;

    await ctx.tx
      .update(userProjection)
      .set({ deactivated_at: new Date(deactivated_at), updated_at: new Date() })
      .where(and(eq(userProjection.user_id, user_id), eq(userProjection.tenant_id, tenant_id)));
  },
};

export const userReactivatedSynced: SubscriberDef = {
  subscription: 'people.user-status.reactivated',
  event: 'identity.user.reactivated',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<UserReactivatedPayload>;
    const { user_id, tenant_id } = e.payload;

    await ctx.tx
      .update(userProjection)
      .set({ deactivated_at: null, updated_at: new Date() })
      .where(and(eq(userProjection.user_id, user_id), eq(userProjection.tenant_id, tenant_id)));
  },
};
