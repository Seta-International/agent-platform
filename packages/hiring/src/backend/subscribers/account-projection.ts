import { makeProjectionUpsertSubscribers } from '@seta/core';
import type { AccountCreatedPayload, AccountUpdatedPayload } from '@seta/pm/events';
import { PM_ACCOUNT_CREATED, PM_ACCOUNT_UPDATED } from '@seta/pm/events';
import { accountProjection } from '../db/schema.ts';

export const [accountProjectionCreated, accountProjectionUpdated] = makeProjectionUpsertSubscribers<
  AccountCreatedPayload | AccountUpdatedPayload
>({
  subscriptionPrefix: 'hiring.account-projection',
  createEvent: PM_ACCOUNT_CREATED,
  updateEvent: PM_ACCOUNT_UPDATED,
  table: accountProjection,
  conflictTarget: accountProjection.account_id,
  toRow: (p) => ({ account_id: p.account_id, tenant_id: p.tenant_id, name: p.name }),
});
