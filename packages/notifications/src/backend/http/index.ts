import type { SessionEnv } from '@seta/core';
import { withEmit } from '@seta/core/events';
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import {
  dismissNotification,
  getUnreadCount,
  listNotificationPrefs,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationNotFound,
  NotificationPrefError,
  requestNotification,
  setNotificationPref,
} from '../../index.ts';
import type { NotificationStreamHub } from '../stream/hub.ts';

const synthesizeSchema = z.object({
  event_type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({}),
});

const HEARTBEAT_INTERVAL_MS = 25_000;

const listQuerySchema = z.object({
  unread: z.enum(['true', 'false']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const patchPrefSchema = z.object({
  event_type: z.string().min(1),
  channel: z.enum(['in_app', 'email']),
  enabled: z.boolean(),
});

function prefErrorToHttp(err: unknown): { status: 400 | 403; body: { error: string } } | null {
  if (!(err instanceof NotificationPrefError)) return null;
  if (err.code === 'FORBIDDEN') return { status: 403, body: { error: 'FORBIDDEN' } };
  return { status: 400, body: { error: err.code } };
}

export function registerNotificationsRoutes(
  app: Hono<SessionEnv>,
  hub: NotificationStreamHub,
): void {
  app.get('/api/notifications/v1', async (c) => {
    const session = c.get('user');
    const parsed = listQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    }
    const page = await listNotifications({
      userId: session.user_id,
      tenantId: session.tenant_id,
      limit: parsed.data.limit ?? 30,
      cursor: parsed.data.cursor,
      unread: parsed.data.unread === 'true',
    });
    return c.json(page);
  });

  app.get('/api/notifications/v1/unread-count', async (c) => {
    const session = c.get('user');
    const count = await getUnreadCount({
      userId: session.user_id,
      tenantId: session.tenant_id,
    });
    return c.json({ count });
  });

  app.post('/api/notifications/v1/read-all', async (c) => {
    const session = c.get('user');
    const result = await markAllNotificationsRead({
      userId: session.user_id,
      tenantId: session.tenant_id,
    });
    return c.json(result);
  });

  app.post('/api/notifications/v1/:id/read', async (c) => {
    const session = c.get('user');
    const id = c.req.param('id');
    try {
      const row = await markNotificationRead({
        id,
        userId: session.user_id,
        tenantId: session.tenant_id,
      });
      return c.json(row);
    } catch (err) {
      if (err instanceof NotificationNotFound) return c.json({ error: 'NOT_FOUND' }, 404);
      throw err;
    }
  });

  app.post('/api/notifications/v1/:id/dismiss', async (c) => {
    const session = c.get('user');
    const id = c.req.param('id');
    try {
      const row = await dismissNotification({
        id,
        userId: session.user_id,
        tenantId: session.tenant_id,
      });
      return c.json(row);
    } catch (err) {
      if (err instanceof NotificationNotFound) return c.json({ error: 'NOT_FOUND' }, 404);
      throw err;
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    app.post('/api/notifications/v1/__dev/synthesize', async (c) => {
      const session = c.get('user');
      const body = await c.req.json().catch(() => ({}));
      const parsed = synthesizeSchema.safeParse(body);
      if (!parsed.success) return c.json({ error: 'VALIDATION' }, 400);

      const sourceEventId = crypto.randomUUID();
      await withEmit(undefined, async () => {
        await requestNotification({
          tenant_id: session.tenant_id,
          event_type: parsed.data.event_type,
          user_ids: [session.user_id],
          payload: parsed.data.payload,
          source_event_id: sourceEventId,
        });
      });
      return c.json({ accepted: true, source_event_id: sourceEventId }, 202);
    });
  }

  app.get('/api/notifications/v1/prefs', async (c) => {
    const session = c.get('user');
    try {
      const matrix = await listNotificationPrefs({ session });
      return c.json(matrix);
    } catch (err) {
      const httpErr = prefErrorToHttp(err);
      if (httpErr) return c.json(httpErr.body, httpErr.status);
      throw err;
    }
  });

  app.patch('/api/notifications/v1/prefs', async (c) => {
    const session = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const parsed = patchPrefSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    }
    try {
      await withEmit(
        { actor: { userId: session.user_id, tenantId: session.tenant_id } },
        async () => {
          await setNotificationPref({
            event_type: parsed.data.event_type,
            channel: parsed.data.channel,
            enabled: parsed.data.enabled,
            session,
          });
        },
      );
      return c.json({ ok: true });
    } catch (err) {
      const httpErr = prefErrorToHttp(err);
      if (httpErr) return c.json(httpErr.body, httpErr.status);
      throw err;
    }
  });

  app.get('/api/notifications/v1/stream', async (c) => {
    const session = c.get('user');
    return streamSSE(c, async (s) => {
      const connectionId = crypto.randomUUID();
      const heartbeat = setInterval(() => {
        s.write(':ping\n\n').catch(() => {});
      }, HEARTBEAT_INTERVAL_MS);
      const cleanup = () => {
        clearInterval(heartbeat);
        hub.unregister(connectionId);
      };
      hub.register({
        id: connectionId,
        userId: session.user_id,
        send: () => {
          s.writeSSE({ event: 'invalidate', data: '{}' }).catch(() => {});
        },
        close: cleanup,
      });
      c.req.raw.signal.addEventListener('abort', cleanup, { once: true });
      await s.write(`:connected ${connectionId}\n\n`);
      await new Promise<void>((resolve) => {
        c.req.raw.signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });
  });
}
