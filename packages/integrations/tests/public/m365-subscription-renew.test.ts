import { describe, expect, it, vi } from 'vitest';
import { runRenewSubscription } from '../../src/m365/jobs/subscription-renew.ts';
import { createM365SubscriptionsRepo } from '../../src/m365/repo-subscriptions.ts';
import { withIntegrationsTestDb } from '../helpers/test-db.ts';

const TWENTY_EIGHT_DAYS_MS = 28 * 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

describe('runRenewSubscription', () => {
  it('happy path: patches Graph, updates DB expiration, enqueues next renewal', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createM365SubscriptionsRepo({ db });
      const tenantId = crypto.randomUUID();
      const subscriptionId = crypto.randomUUID();

      const expirationAt = new Date(Date.now() + ONE_HOUR_MS);
      const row = await repo.upsert({
        tenantId,
        subscriptionId,
        resource: '/groups',
        changeType: 'updated,deleted',
        expirationAt,
        clientStateHmac: 'test-hmac',
      });

      const patchFn = vi.fn().mockResolvedValue(undefined);
      const graphClient = {
        api(_path: string) {
          return { patch: patchFn };
        },
      };
      const workerAddJob = vi.fn().mockResolvedValue(undefined);

      await runRenewSubscription(
        { subscription_row_id: row.id },
        { graphClient, subscriptionsRepo: repo, workerAddJob },
      );

      // Graph PATCH was called with the correct path and new expiration
      expect(patchFn).toHaveBeenCalledOnce();
      const patchBody = patchFn.mock.calls[0]![0] as { expirationDateTime: string };
      const patchedExpiration = new Date(patchBody.expirationDateTime).getTime();
      const expectedExpiration = Date.now() + TWENTY_EIGHT_DAYS_MS;
      expect(Math.abs(patchedExpiration - expectedExpiration)).toBeLessThan(ONE_MINUTE_MS);

      // DB row expirationAt updated
      const updated = await repo.findById(row.id);
      expect(updated).not.toBeNull();
      expect(Math.abs(updated!.expirationAt.getTime() - expectedExpiration)).toBeLessThan(
        ONE_MINUTE_MS,
      );

      // Next renewal job enqueued for newExpiration - 24h
      expect(workerAddJob).toHaveBeenCalledOnce();
      const [identifier, payload, opts] = workerAddJob.mock.calls[0] as [
        string,
        { subscription_row_id: string },
        { runAt: Date },
      ];
      expect(identifier).toBe('m365.subscription.renew');
      expect(payload.subscription_row_id).toBe(row.id);
      const expectedRunAt = expectedExpiration - TWENTY_FOUR_HOURS_MS;
      expect(Math.abs(opts.runAt.getTime() - expectedRunAt)).toBeLessThan(ONE_MINUTE_MS);
    });
  });

  it('missing row: exits cleanly without calling Graph or enqueuing a job', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createM365SubscriptionsRepo({ db });

      const patchFn = vi.fn();
      const graphClient = {
        api(_path: string) {
          return { patch: patchFn };
        },
      };
      const workerAddJob = vi.fn();

      const nonExistentId = crypto.randomUUID();
      await expect(
        runRenewSubscription(
          { subscription_row_id: nonExistentId },
          { graphClient, subscriptionsRepo: repo, workerAddJob },
        ),
      ).resolves.toBeUndefined();

      expect(patchFn).not.toHaveBeenCalled();
      expect(workerAddJob).not.toHaveBeenCalled();
    });
  });

  it('Graph failure: error propagates, DB expiration is unchanged', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createM365SubscriptionsRepo({ db });
      const tenantId = crypto.randomUUID();
      const subscriptionId = crypto.randomUUID();

      const originalExpiration = new Date(Date.now() + ONE_HOUR_MS);
      const row = await repo.upsert({
        tenantId,
        subscriptionId,
        resource: '/groups',
        changeType: 'updated,deleted',
        expirationAt: originalExpiration,
        clientStateHmac: 'test-hmac',
      });

      const graphError = new Error('Graph API unavailable');
      const patchFn = vi.fn().mockRejectedValue(graphError);
      const graphClient = {
        api(_path: string) {
          return { patch: patchFn };
        },
      };
      const workerAddJob = vi.fn();

      await expect(
        runRenewSubscription(
          { subscription_row_id: row.id },
          { graphClient, subscriptionsRepo: repo, workerAddJob },
        ),
      ).rejects.toThrow('Graph API unavailable');

      // DB expiration must be unchanged
      const unchanged = await repo.findById(row.id);
      expect(unchanged).not.toBeNull();
      expect(unchanged!.expirationAt.getTime()).toBe(originalExpiration.getTime());

      // Next job must NOT have been enqueued
      expect(workerAddJob).not.toHaveBeenCalled();
    });
  });
});
