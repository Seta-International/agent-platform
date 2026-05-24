import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';

export interface BuildWebhookRouterDeps {
  webhookSecret: string;
  subscriptionsRepo: {
    findBySubscriptionId(subscriptionId: string): Promise<{
      id: string;
      tenantId: string;
      subscriptionId: string;
      resource: string;
      clientStateHmac: string;
    } | null>;
  };
  linksRepo: {
    findByExternal(
      tenantId: string,
      externalId: string,
    ): Promise<{
      id: string;
      groupId: string;
    } | null>;
  };
  enqueuePullJob(input: {
    tenant_id: string;
    group_id: string;
    external_id: string;
  }): Promise<void>;
}

interface NotificationItem {
  subscriptionId: string;
  changeType: string;
  resource: string;
  resourceData?: { id?: string };
  clientState: string;
}

export function buildWebhookRouter(deps: BuildWebhookRouterDeps): Hono {
  const app = new Hono();

  app.post('/api/webhooks/m365/notifications', async (c) => {
    // Validation handshake: Microsoft sends POST with ?validationToken=X; echo it as text/plain 200.
    const validationToken = c.req.query('validationToken');
    if (validationToken) {
      return c.text(validationToken, 200, { 'Content-Type': 'text/plain' });
    }

    const body = await c.req
      .json<{ value?: NotificationItem[] }>()
      .catch(() => ({ value: [] as NotificationItem[] }));

    for (const n of body.value ?? []) {
      const sub = await deps.subscriptionsRepo.findBySubscriptionId(n.subscriptionId);
      if (!sub) return c.json({ error: 'unauthorized' }, 401);

      const expected = createHmac('sha256', deps.webhookSecret).update(sub.tenantId).digest('hex');
      const provided = n.clientState;

      // timingSafeEqual requires equal-length buffers; length mismatch means the state is wrong
      if (
        provided.length !== expected.length ||
        !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
      ) {
        return c.json({ error: 'unauthorized' }, 401);
      }

      // Extract the group's external ID from the resource path or resourceData
      const externalId = (n.resource.split('/').pop() ?? n.resourceData?.id ?? '').trim();
      if (!externalId) continue;

      const link = await deps.linksRepo.findByExternal(sub.tenantId, externalId);
      if (link) {
        await deps.enqueuePullJob({
          tenant_id: sub.tenantId,
          group_id: link.groupId,
          external_id: externalId,
        });
      }
    }

    return c.json({ ok: true }, 202);
  });

  // Lifecycle endpoint — receives subscription lifecycle notifications (e.g. subscriptionRemoved)
  app.post('/api/webhooks/m365/lifecycle', async (c) => {
    return c.json({ ok: true }, 202);
  });

  return app;
}
