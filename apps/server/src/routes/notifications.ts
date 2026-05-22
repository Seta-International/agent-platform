import {
  dismissNotification,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationNotFound,
  type SessionEnv,
} from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';
import type { NotificationStreamHub } from '../notifications-stream/hub.ts';

const listQuerySchema = z.object({
  unread: z.enum(['true', 'false']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export function registerNotificationsRoutes(
  app: Hono<SessionEnv>,
  hub: NotificationStreamHub,
): void {
  void hub;
  app.get('/api/core/v1/notifications', async (c) => {
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

  app.get('/api/core/v1/notifications/unread-count', async (c) => {
    const session = c.get('user');
    const count = await getUnreadCount({
      userId: session.user_id,
      tenantId: session.tenant_id,
    });
    return c.json({ count });
  });

  app.post('/api/core/v1/notifications/read-all', async (c) => {
    const session = c.get('user');
    const result = await markAllNotificationsRead({
      userId: session.user_id,
      tenantId: session.tenant_id,
    });
    return c.json(result);
  });

  app.post('/api/core/v1/notifications/:id/read', async (c) => {
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

  app.post('/api/core/v1/notifications/:id/dismiss', async (c) => {
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
}
