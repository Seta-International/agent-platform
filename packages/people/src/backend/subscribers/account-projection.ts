import type { AccountCreatedPayload, AccountUpdatedPayload } from '@seta/pm/events';
import { PM_ACCOUNT_CREATED, PM_ACCOUNT_UPDATED } from '@seta/pm/events';
import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { and, eq } from 'drizzle-orm';
import { accountProjection, workerAllocationProjection } from '../db/schema.ts';

export const accountProjectionCreated: SubscriberDef = {
  subscription: 'people.account-projection.created',
  event: PM_ACCOUNT_CREATED,
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<AccountCreatedPayload>;
    const { account_id, tenant_id, name, am_worker_id } = e.payload;

    await ctx.tx
      .insert(accountProjection)
      .values({
        account_id,
        tenant_id,
        name,
        am_worker_id: am_worker_id ?? null,
      })
      .onConflictDoUpdate({
        target: accountProjection.account_id,
        set: {
          name,
          am_worker_id: am_worker_id ?? null,
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
    const { account_id, tenant_id, name, am_worker_id } = e.payload;

    await ctx.tx
      .insert(accountProjection)
      .values({
        account_id,
        tenant_id,
        name,
        am_worker_id: am_worker_id ?? null,
      })
      .onConflictDoUpdate({
        target: accountProjection.account_id,
        set: {
          name,
          am_worker_id: am_worker_id ?? null,
          updated_at: new Date(),
        },
      });

    await ctx.tx
      .update(workerAllocationProjection)
      .set({ account_name: name, updated_at: new Date() })
      .where(
        and(
          eq(workerAllocationProjection.account_id, account_id),
          eq(workerAllocationProjection.tenant_id, tenant_id),
        ),
      );
  },
};
