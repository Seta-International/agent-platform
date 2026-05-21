import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { BuildWebhookRouterDeps } from '../../src/m365/webhook.ts';
import { buildWebhookRouter } from '../../src/m365/webhook.ts';

function makeEnqueueMock() {
  return vi.fn<BuildWebhookRouterDeps['enqueuePullJob']>().mockResolvedValue(undefined);
}

const WEBHOOK_SECRET = 'test-webhook-secret-32-chars-paddd';
const TENANT_ID = crypto.randomUUID();
const SUBSCRIPTION_ID = 'graph-sub-001';
const EXTERNAL_ID = 'm365-group-ext-001';
const GROUP_ID = crypto.randomUUID();

function validClientState() {
  return createHmac('sha256', WEBHOOK_SECRET).update(TENANT_ID).digest('hex');
}

function makeSubsRepo(
  row: {
    id: string;
    tenantId: string;
    subscriptionId: string;
    resource: string;
    clientStateHmac: string;
  } | null,
) {
  return {
    findBySubscriptionId: vi.fn().mockResolvedValue(row),
  };
}

function makeLinksRepo(row: { id: string; groupId: string } | null) {
  return {
    findByExternal: vi.fn().mockResolvedValue(row),
  };
}

type SubsRow = {
  id: string;
  tenantId: string;
  subscriptionId: string;
  resource: string;
  clientStateHmac: string;
} | null;

function buildApp(overrides?: {
  subsRow?: SubsRow;
  linkRow?: { id: string; groupId: string } | null;
  enqueuePullJob?: BuildWebhookRouterDeps['enqueuePullJob'];
}) {
  const enqueuePullJob = overrides?.enqueuePullJob ?? makeEnqueueMock();
  const subsRow: SubsRow =
    overrides?.subsRow !== undefined
      ? overrides.subsRow
      : {
          id: crypto.randomUUID(),
          tenantId: TENANT_ID,
          subscriptionId: SUBSCRIPTION_ID,
          resource: '/groups',
          clientStateHmac: validClientState(),
        };
  const linkRow: { id: string; groupId: string } | null =
    overrides?.linkRow !== undefined
      ? overrides.linkRow
      : { id: crypto.randomUUID(), groupId: GROUP_ID };

  const router = buildWebhookRouter({
    webhookSecret: WEBHOOK_SECRET,
    subscriptionsRepo: makeSubsRepo(subsRow),
    linksRepo: makeLinksRepo(linkRow),
    enqueuePullJob,
  });

  return { router, enqueuePullJob };
}

function notificationBody(opts: {
  subscriptionId?: string;
  clientState?: string;
  externalId?: string;
}) {
  return JSON.stringify({
    value: [
      {
        subscriptionId: opts.subscriptionId ?? SUBSCRIPTION_ID,
        changeType: 'updated',
        resource: `/groups/${opts.externalId ?? EXTERNAL_ID}`,
        resourceData: { id: opts.externalId ?? EXTERNAL_ID },
        clientState: opts.clientState ?? validClientState(),
      },
    ],
  });
}

describe('buildWebhookRouter', () => {
  describe('validation handshake', () => {
    it('POST with ?validationToken echoes token as text/plain 200', async () => {
      const { router } = buildApp();
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

  describe('notification processing', () => {
    it('unknown subscriptionId returns 401', async () => {
      const enqueuePullJob = makeEnqueueMock();
      const router = buildWebhookRouter({
        webhookSecret: WEBHOOK_SECRET,
        subscriptionsRepo: makeSubsRepo(null),
        linksRepo: makeLinksRepo({ id: crypto.randomUUID(), groupId: GROUP_ID }),
        enqueuePullJob,
      });

      const res = await router.request('/api/webhooks/m365/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: notificationBody({}),
      });

      expect(res.status).toBe(401);
      expect(enqueuePullJob).not.toHaveBeenCalled();
    });

    it('valid subscriptionId but wrong clientState returns 401', async () => {
      const enqueuePullJob = makeEnqueueMock();
      const router = buildWebhookRouter({
        webhookSecret: WEBHOOK_SECRET,
        subscriptionsRepo: makeSubsRepo({
          id: crypto.randomUUID(),
          tenantId: TENANT_ID,
          subscriptionId: SUBSCRIPTION_ID,
          resource: '/groups',
          clientStateHmac: validClientState(),
        }),
        linksRepo: makeLinksRepo({ id: crypto.randomUUID(), groupId: GROUP_ID }),
        enqueuePullJob,
      });

      const res = await router.request('/api/webhooks/m365/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: notificationBody({ clientState: 'totally-wrong-client-state' }),
      });

      expect(res.status).toBe(401);
      expect(enqueuePullJob).not.toHaveBeenCalled();
    });

    it('valid sub + correct clientState + matching link → enqueuePullJob called, returns 202', async () => {
      const enqueuePullJob = makeEnqueueMock();
      const router = buildWebhookRouter({
        webhookSecret: WEBHOOK_SECRET,
        subscriptionsRepo: makeSubsRepo({
          id: crypto.randomUUID(),
          tenantId: TENANT_ID,
          subscriptionId: SUBSCRIPTION_ID,
          resource: '/groups',
          clientStateHmac: validClientState(),
        }),
        linksRepo: makeLinksRepo({ id: crypto.randomUUID(), groupId: GROUP_ID }),
        enqueuePullJob,
      });

      const res = await router.request('/api/webhooks/m365/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: notificationBody({}),
      });

      expect(res.status).toBe(202);
      expect(enqueuePullJob).toHaveBeenCalledOnce();
      expect(enqueuePullJob).toHaveBeenCalledWith({
        tenant_id: TENANT_ID,
        group_id: GROUP_ID,
        external_id: EXTERNAL_ID,
      });
    });

    it('valid sub but no link for the external_id → no enqueue, returns 202', async () => {
      const enqueuePullJob = makeEnqueueMock();
      const router = buildWebhookRouter({
        webhookSecret: WEBHOOK_SECRET,
        subscriptionsRepo: makeSubsRepo({
          id: crypto.randomUUID(),
          tenantId: TENANT_ID,
          subscriptionId: SUBSCRIPTION_ID,
          resource: '/groups',
          clientStateHmac: validClientState(),
        }),
        linksRepo: makeLinksRepo(null),
        enqueuePullJob,
      });

      const res = await router.request('/api/webhooks/m365/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: notificationBody({}),
      });

      expect(res.status).toBe(202);
      expect(enqueuePullJob).not.toHaveBeenCalled();
    });

    it('lifecycle endpoint returns 202', async () => {
      const { router } = buildApp();
      const res = await router.request('/api/webhooks/m365/lifecycle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(202);
    });
  });
});
