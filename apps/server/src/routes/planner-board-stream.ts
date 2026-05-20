import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { BoardStreamHub } from '../board-stream/hub.ts';

const HEARTBEAT_INTERVAL_MS = 30_000;

export function registerPlannerBoardStreamRoutes(app: Hono<SessionEnv>, hub: BoardStreamHub): void {
  app.get('/api/planner/v1/board/stream', async (c) => {
    const session = c.get('user');
    const groupIdsParam = c.req.query('group_ids') ?? '';
    const requestedGroupIds = groupIdsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const accessible = new Set(session.accessible_group_ids);
    const isAdmin =
      session.role_summary.roles.includes('org.admin') ||
      session.role_summary.roles.includes('tenant.admin') ||
      session.cross_tenant_read;

    const filterGroupIds = isAdmin
      ? new Set(requestedGroupIds)
      : new Set(requestedGroupIds.filter((g) => accessible.has(g)));

    if (filterGroupIds.size === 0) {
      return c.json({ error: 'FORBIDDEN', message: 'No accessible groups in request' }, 403);
    }

    return streamSSE(
      c,
      async (s) => {
        const connectionId = crypto.randomUUID();

        const heartbeat = setInterval(() => {
          s.write(':keepalive\n\n').catch(() => {});
        }, HEARTBEAT_INTERVAL_MS);

        const cleanup = () => {
          clearInterval(heartbeat);
          hub.unregister(connectionId);
        };

        hub.register({
          id: connectionId,
          filterGroupIds,
          send: (eventType, payload) => {
            s.writeSSE({ event: eventType, data: JSON.stringify(payload) }).catch(() => {});
          },
          close: cleanup,
        });

        c.req.raw.signal.addEventListener('abort', cleanup, { once: true });

        // Let the client know the stream is alive.
        await s.write(`:connected ${connectionId}\n\n`);

        // Hold the stream open until the client disconnects.
        await new Promise<void>((resolve) => {
          c.req.raw.signal.addEventListener('abort', () => resolve(), { once: true });
        });
      },
      async (_err, _s) => {
        // Stream error — connection will be cleaned up via the abort signal.
      },
    );
  });
}
