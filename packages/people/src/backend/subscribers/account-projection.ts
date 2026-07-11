import type { AccountCreatedPayload, AccountUpdatedPayload } from '@seta/pm/events';
import { PM_ACCOUNT_CREATED, PM_ACCOUNT_UPDATED } from '@seta/pm/events';
import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { accountProjection } from '../db/schema.ts';

export const accountProjectionCreated: SubscriberDef = {
  subscription: 'people.account-projection.created',
  event: PM_ACCOUNT_CREATED,
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<AccountCreatedPayload>;
    const { account_id, tenant_id, name } = e.payload;

    await ctx.tx
      .insert(accountProjection)
      .values({
        account_id,
        tenant_id,
        name,
      })
      .onConflictDoUpdate({
        target: accountProjection.account_id,
        set: {
          name,
          updated_at: new Date(),
        },
      });
  },
};

export const accountProjectionUpdated: SubscriberDef = {
  subscription: 'people.account-projection.updated',
  event: PM_ACCOUNT_UPDATED,
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<AccountUpdatedPayload>;
    const { account_id, tenant_id, name } = e.payload;

    await ctx.tx
      .insert(accountProjection)
      .values({
        account_id,
        tenant_id,
        name,
      })
      .onConflictDoUpdate({
        target: accountProjection.account_id,
        set: {
          name,
          updated_at: new Date(),
        },
      });
  },
};
