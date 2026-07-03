import type { AccountCreatedPayload, AccountUpdatedPayload } from '@seta/pm/events';
import { PM_ACCOUNT_CREATED, PM_ACCOUNT_UPDATED } from '@seta/pm/events';
import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { accountProjection } from '../db/schema.ts';

// Keep a local {account_id -> name} read-model so requisitions can show the account name
// without a cross-module join. Idempotent upsert (at-least-once delivery).
async function upsert(
  event: DomainEvent<AccountCreatedPayload | AccountUpdatedPayload>,
  ctx: { tx: Parameters<SubscriberDef['handler']>[1]['tx'] },
): Promise<void> {
  const { account_id, tenant_id, name, am_worker_id } = event.payload;
  await ctx.tx
    .insert(accountProjection)
    .values({ account_id, tenant_id, name, am_worker_id })
    .onConflictDoUpdate({
      target: accountProjection.account_id,
      set: { tenant_id, name, am_worker_id },
    });
}

export const accountProjectionCreated: SubscriberDef = {
  subscription: 'hiring.account-projection.created',
  event: PM_ACCOUNT_CREATED,
  eventVersion: 1,
  handler: (event, ctx) => upsert(event as DomainEvent<AccountCreatedPayload>, ctx),
};

export const accountProjectionUpdated: SubscriberDef = {
  subscription: 'hiring.account-projection.updated',
  event: PM_ACCOUNT_UPDATED,
  eventVersion: 1,
  handler: (event, ctx) => upsert(event as DomainEvent<AccountUpdatedPayload>, ctx),
};
