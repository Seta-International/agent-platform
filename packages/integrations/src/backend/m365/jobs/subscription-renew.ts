import type { M365SubscriptionsRepo } from '../repo-subscriptions.ts';
import type { GraphLikePatch } from './_graph-types.ts';

export interface RunRenewSubscriptionInput {
  subscription_row_id: string;
}

export interface RunRenewSubscriptionDeps {
  graphClient: GraphLikePatch;
  subscriptionsRepo: M365SubscriptionsRepo;
  workerAddJob(identifier: string, payload: unknown, opts?: { runAt?: Date }): Promise<void>;
}

export async function runRenewSubscription(
  input: RunRenewSubscriptionInput,
  deps: RunRenewSubscriptionDeps,
): Promise<void> {
  const { subscription_row_id } = input;
  const { graphClient, subscriptionsRepo, workerAddJob } = deps;

  const row = await subscriptionsRepo.findById(subscription_row_id);
  if (!row) {
    // Subscription row was deleted — nothing to renew
    return;
  }

  const newExpiration = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000);

  // Throws on Graph error — let graphile-worker handle retries
  await graphClient.api(`/subscriptions/${row.subscriptionId}`).patch({
    expirationDateTime: newExpiration.toISOString(),
  });

  await subscriptionsRepo.setExpiration(row.id, newExpiration);

  // tenant_id must be threaded through every reschedule, not just the first enqueue
  // (from runCreateSubscription) — this job reschedules itself indefinitely, and a
  // payload that drops tenant_id here would renew successfully once then silently
  // stop (no tenant GUC, RLS-enforced connection reads zero rows on the next run).
  const renewAt = new Date(newExpiration.getTime() - 24 * 60 * 60 * 1000);
  await workerAddJob(
    'm365.subscription.renew',
    { subscription_row_id: row.id, tenant_id: row.tenantId },
    { runAt: renewAt },
  );
}
