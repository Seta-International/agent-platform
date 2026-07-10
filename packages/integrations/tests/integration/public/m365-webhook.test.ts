import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { integrationsDb, resetIntegrationsDb } from '../../../src/backend/db/client.ts';
import { createM365GroupLinkRepo } from '../../../src/backend/m365/repo.ts';
import { createM365SubscriptionsRepo } from '../../../src/backend/m365/repo-subscriptions.ts';
import type { BuildWebhookRouterDeps } from '../../../src/backend/m365/webhook.ts';
import { buildWebhookRouter } from '../../../src/backend/m365/webhook.ts';
import { withIntegrationsTestDb } from '../../helpers/test-db.ts';

const WEBHOOK_SECRET = 'test-webhook-secret-32-chars-paddd';

function makeEnqueueMock() {
  return vi.fn<BuildWebhookRouterDeps['enqueuePullJob']>().mockResolvedValue(undefined);
}

function validClientState(tenantId: string) {
  return createHmac('sha256', WEBHOOK_SECRET).update(tenantId).digest('hex');
}

function notificationBody(opts: {
  subscriptionId: string;
  clientState: string;
  externalId: string;
}) {
  return JSON.stringify({
    value: [
      {
        subscriptionId: opts.subscriptionId,
        changeType: 'updated',
        resource: `/groups/${opts.externalId}`,
        resourceData: { id: opts.externalId },
        clientState: opts.clientState,
      },
    ],
  });
}

describe('buildWebhookRouter — production condition: no ambient executor context', () => {
  // Microsoft calls this route directly; boot.ts mounts it outside sessionMiddleware,
  // so no scoped()/maintenance() context is open when the request arrives — the router
  // itself must open the contexts it needs. Real repos (no mocks) prove that.
  it('resolves the tenant via maintenance(), scopes the link lookup, and enqueues the pull job', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      resetIntegrationsDb();
      const tenantId = crypto.randomUUID();
      const subscriptionId = crypto.randomUUID();
      const externalId = crypto.randomUUID();
      const groupId = crypto.randomUUID();

      await pool.query(
        `INSERT INTO integrations.m365_subscriptions
           (tenant_id, subscription_id, resource, change_type, expiration_at, client_state_hmac)
         VALUES ($1, $2, '/groups', 'updated,deleted', now() + interval '1 day', $3)`,
        [tenantId, subscriptionId, validClientState(tenantId)],
      );
      await pool.query(
        `INSERT INTO integrations.m365_group_links
           (tenant_id, group_id, external_id, last_synced_fields)
         VALUES ($1, $2, $3, '{}'::jsonb)`,
        [tenantId, groupId, externalId],
      );

      const enqueuePullJob = makeEnqueueMock();
      const router = buildWebhookRouter({
        webhookSecret: WEBHOOK_SECRET,
        subscriptionsRepo: createM365SubscriptionsRepo({ db: integrationsDb }),
        linksRepo: createM365GroupLinkRepo({ db: integrationsDb }),
        enqueuePullJob,
      });

      const res = await router.request('/api/webhooks/m365/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: notificationBody({
          subscriptionId,
          externalId,
          clientState: validClientState(tenantId),
        }),
      });

      expect(res.status).toBe(202);
      expect(enqueuePullJob).toHaveBeenCalledOnce();
      expect(enqueuePullJob).toHaveBeenCalledWith({
        tenant_id: tenantId,
        group_id: groupId,
        external_id: externalId,
      });
    });
  });

  // The lookup moved from the (formerly ambient) app connection to maintenance()'s admin
  // pool — this proves that move didn't loosen the HMAC check it feeds.
  it('wrong clientState still returns 401 and does not enqueue', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      resetIntegrationsDb();
      const tenantId = crypto.randomUUID();
      const subscriptionId = crypto.randomUUID();
      const externalId = crypto.randomUUID();
      const groupId = crypto.randomUUID();

      await pool.query(
        `INSERT INTO integrations.m365_subscriptions
           (tenant_id, subscription_id, resource, change_type, expiration_at, client_state_hmac)
         VALUES ($1, $2, '/groups', 'updated,deleted', now() + interval '1 day', $3)`,
        [tenantId, subscriptionId, validClientState(tenantId)],
      );
      await pool.query(
        `INSERT INTO integrations.m365_group_links
           (tenant_id, group_id, external_id, last_synced_fields)
         VALUES ($1, $2, $3, '{}'::jsonb)`,
        [tenantId, groupId, externalId],
      );

      const enqueuePullJob = makeEnqueueMock();
      const router = buildWebhookRouter({
        webhookSecret: WEBHOOK_SECRET,
        subscriptionsRepo: createM365SubscriptionsRepo({ db: integrationsDb }),
        linksRepo: createM365GroupLinkRepo({ db: integrationsDb }),
        enqueuePullJob,
      });

      const res = await router.request('/api/webhooks/m365/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: notificationBody({
          subscriptionId,
          externalId,
          clientState: 'totally-wrong-client-state',
        }),
      });

      expect(res.status).toBe(401);
      expect(enqueuePullJob).not.toHaveBeenCalled();
    });
  });
});

describe('buildWebhookRouter', () => {
  describe('validation handshake', () => {
    it('POST with ?validationToken echoes token as text/plain 200', async () => {
      await withIntegrationsTestDb(async () => {
        resetIntegrationsDb();
        const router = buildWebhookRouter({
          webhookSecret: WEBHOOK_SECRET,
          subscriptionsRepo: { findBySubscriptionId: vi.fn() },
          linksRepo: { findByExternal: vi.fn() },
          enqueuePullJob: makeEnqueueMock(),
        });
        const res = await router.request(
          '/api/webhooks/m365/notifications?validationToken=hello-token',
          { method: 'POST' },
        );

        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/plain');
        const body = await res.text();
        expect(body).toBe('hello-token');
      });
    });
  });

  describe('notification processing', () => {
    it('unknown subscriptionId returns 401', async () => {
      await withIntegrationsTestDb(async () => {
        resetIntegrationsDb();
        const enqueuePullJob = makeEnqueueMock();
        const router = buildWebhookRouter({
          webhookSecret: WEBHOOK_SECRET,
          subscriptionsRepo: { findBySubscriptionId: vi.fn().mockResolvedValue(null) },
          linksRepo: { findByExternal: vi.fn() },
          enqueuePullJob,
        });

        const res = await router.request('/api/webhooks/m365/notifications', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: notificationBody({
            subscriptionId: 'graph-sub-001',
            externalId: 'm365-group-ext-001',
            clientState: 'irrelevant',
          }),
        });

        expect(res.status).toBe(401);
        expect(enqueuePullJob).not.toHaveBeenCalled();
      });
    });

    it('valid sub but no link for the external_id → no enqueue, returns 202', async () => {
      await withIntegrationsTestDb(async () => {
        resetIntegrationsDb();
        const tenantId = crypto.randomUUID();
        const subscriptionId = 'graph-sub-001';
        const enqueuePullJob = makeEnqueueMock();
        const router = buildWebhookRouter({
          webhookSecret: WEBHOOK_SECRET,
          subscriptionsRepo: {
            findBySubscriptionId: vi.fn().mockResolvedValue({
              id: crypto.randomUUID(),
              tenantId,
              subscriptionId,
              resource: '/groups',
              clientStateHmac: validClientState(tenantId),
            }),
          },
          linksRepo: { findByExternal: vi.fn().mockResolvedValue(null) },
          enqueuePullJob,
        });

        const res = await router.request('/api/webhooks/m365/notifications', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: notificationBody({
            subscriptionId,
            externalId: 'm365-group-ext-001',
            clientState: validClientState(tenantId),
          }),
        });

        expect(res.status).toBe(202);
        expect(enqueuePullJob).not.toHaveBeenCalled();
      });
    });

    it('lifecycle endpoint returns 202', async () => {
      await withIntegrationsTestDb(async () => {
        resetIntegrationsDb();
        const router = buildWebhookRouter({
          webhookSecret: WEBHOOK_SECRET,
          subscriptionsRepo: { findBySubscriptionId: vi.fn() },
          linksRepo: { findByExternal: vi.fn() },
          enqueuePullJob: makeEnqueueMock(),
        });
        const res = await router.request('/api/webhooks/m365/lifecycle', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(202);
      });
    });
  });
});
