import { createHmac } from 'node:crypto';
import type { M365SubscriptionInsert, M365SubscriptionRow } from '../repo-subscriptions.ts';
import type { GraphLikePost } from './_graph-types.ts';

export type GraphLike = GraphLikePost;

export interface RunCreateSubscriptionInput {
  tenant_id: string;
  resource: string;
  change_type: string;
  notification_url: string;
  lifecycle_url?: string;
}

export interface RunCreateSubscriptionDeps {
  graphClient: GraphLike;
  webhookSecret: string;
  subscriptionsRepo: {
    upsert(input: M365SubscriptionInsert): Promise<M365SubscriptionRow>;
  };
  workerAddJob(identifier: string, payload: unknown, opts?: { runAt?: Date }): Promise<void>;
}

export async function runCreateSubscription(
  input: RunCreateSubscriptionInput,
  deps: RunCreateSubscriptionDeps,
): Promise<{ subscription_id: string }> {
  const { graphClient, webhookSecret, subscriptionsRepo, workerAddJob } = deps;

  // MS Graph subscription max lifetime is 29 days for groups; use 28d minus 1h buffer
  const expirationAt = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000);
  const clientState = createHmac('sha256', webhookSecret).update(input.tenant_id).digest('hex');

  const created = await graphClient.api('/subscriptions').post({
    changeType: input.change_type,
    notificationUrl: input.notification_url,
    lifecycleNotificationUrl: input.lifecycle_url,
    resource: input.resource,
    expirationDateTime: expirationAt.toISOString(),
    clientState,
  });

  const row = await subscriptionsRepo.upsert({
    tenantId: input.tenant_id,
    subscriptionId: created.id,
    resource: input.resource,
    changeType: input.change_type,
    expirationAt,
    clientStateHmac: clientState,
  });

  // Schedule renewal 24h before expiration
  const renewAt = new Date(expirationAt.getTime() - 24 * 60 * 60 * 1000);
  await workerAddJob(
    'm365.subscription.renew',
    { subscription_row_id: row.id },
    { runAt: renewAt },
  );

  return { subscription_id: created.id };
}
