import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { runCreateSubscription } from '../../src/m365/jobs/subscription-create.ts';
import { createM365SubscriptionsRepo } from '../../src/m365/repo-subscriptions.ts';
import { withIntegrationsTestDb } from '../helpers/test-db.ts';

const WEBHOOK_SECRET = 'test-webhook-secret-32-chars-paddd';

function makeGraphStub(returnedId: string) {
  return {
    api(_path: string) {
      return {
        post: vi.fn().mockResolvedValue({ id: returnedId }),
      };
    },
  };
}

describe('runCreateSubscription', () => {
  it('creates a row in m365_subscriptions with correct columns', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const tenantId = crypto.randomUUID();
      const subscriptionId = crypto.randomUUID();
      const graphStub = makeGraphStub(subscriptionId);
      const workerAddJob = vi.fn().mockResolvedValue(undefined);
      const repo = createM365SubscriptionsRepo({ db });

      await runCreateSubscription(
        {
          tenant_id: tenantId,
          resource: '/groups',
          change_type: 'updated,deleted',
          notification_url: 'https://example.com/api/webhooks/m365/notifications',
        },
        {
          graphClient: graphStub,
          webhookSecret: WEBHOOK_SECRET,
          subscriptionsRepo: repo,
          workerAddJob,
        },
      );

      const row = await repo.findBySubscriptionId(subscriptionId);
      expect(row).not.toBeNull();
      expect(row!.tenantId).toBe(tenantId);
      expect(row!.subscriptionId).toBe(subscriptionId);
      expect(row!.resource).toBe('/groups');
      expect(row!.changeType).toBe('updated,deleted');

      // Expiration is 28d minus 1h buffer from now
      const expectedExpiration = Date.now() + 28 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000;
      const diff = Math.abs(row!.expirationAt.getTime() - expectedExpiration);
      expect(diff).toBeLessThan(5 * 60 * 1000); // within 5 minutes

      // clientStateHmac is HMAC-SHA256(secret, tenantId)
      const expectedHmac = createHmac('sha256', WEBHOOK_SECRET).update(tenantId).digest('hex');
      expect(row!.clientStateHmac).toBe(expectedHmac);
    });
  });

  it('enqueues a m365.subscription.renew job scheduled for expiration_at - 24h', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const tenantId = crypto.randomUUID();
      const subscriptionId = crypto.randomUUID();
      const graphStub = makeGraphStub(subscriptionId);
      const workerAddJob = vi.fn().mockResolvedValue(undefined);
      const repo = createM365SubscriptionsRepo({ db });

      await runCreateSubscription(
        {
          tenant_id: tenantId,
          resource: '/groups',
          change_type: 'updated,deleted',
          notification_url: 'https://example.com/api/webhooks/m365/notifications',
        },
        {
          graphClient: graphStub,
          webhookSecret: WEBHOOK_SECRET,
          subscriptionsRepo: repo,
          workerAddJob,
        },
      );

      expect(workerAddJob).toHaveBeenCalledOnce();
      const [identifier, payload, opts] = workerAddJob.mock.calls[0] as [
        string,
        { subscription_row_id: string },
        { runAt: Date },
      ];
      expect(identifier).toBe('m365.subscription.renew');
      expect(typeof payload.subscription_row_id).toBe('string');

      // runAt is expiration_at - 24h, where expiration_at = now + 28d - 1h
      const expectedRunAt =
        Date.now() + 28 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000 - 24 * 60 * 60 * 1000;
      const diff = Math.abs((opts.runAt as Date).getTime() - expectedRunAt);
      expect(diff).toBeLessThan(5 * 60 * 1000);
    });
  });

  it('upsert by (tenantId, resource) — second call updates rather than inserts', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const tenantId = crypto.randomUUID();
      const firstId = crypto.randomUUID();
      const secondId = crypto.randomUUID();
      const workerAddJob = vi.fn().mockResolvedValue(undefined);
      const repo = createM365SubscriptionsRepo({ db });

      await runCreateSubscription(
        {
          tenant_id: tenantId,
          resource: '/groups',
          change_type: 'updated,deleted',
          notification_url: 'https://example.com/api/webhooks/m365/notifications',
        },
        {
          graphClient: makeGraphStub(firstId),
          webhookSecret: WEBHOOK_SECRET,
          subscriptionsRepo: repo,
          workerAddJob,
        },
      );

      await runCreateSubscription(
        {
          tenant_id: tenantId,
          resource: '/groups',
          change_type: 'updated,deleted',
          notification_url: 'https://example.com/api/webhooks/m365/notifications',
        },
        {
          graphClient: makeGraphStub(secondId),
          webhookSecret: WEBHOOK_SECRET,
          subscriptionsRepo: repo,
          workerAddJob,
        },
      );

      // findBySubscriptionId on secondId should find the updated row
      const row = await repo.findBySubscriptionId(secondId);
      expect(row).not.toBeNull();
      expect(row!.subscriptionId).toBe(secondId);

      // findBySubscriptionId on firstId should return null (row was updated in place)
      const old = await repo.findBySubscriptionId(firstId);
      expect(old).toBeNull();
    });
  });
});
