import type { SessionEnv } from '@seta/core';
import { IdentityError } from '@seta/identity';
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { KnowledgeStreamHub } from '../stream/hub.ts';

const HEARTBEAT_INTERVAL_MS = 30_000;

export function registerKnowledgeStreamRoutes(
  app: Hono<SessionEnv>,
  hub: KnowledgeStreamHub,
): void {
  app.get('/api/copilot/v1/knowledge/stream', async (c) => {
    const scope = c.get('user');
    if (!scope.role_summary.roles.includes('org.admin')) {
      throw new IdentityError('FORBIDDEN', 'tenant_admin required');
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
          tenant_id: scope.tenant_id,
          send: (payload) => {
            s.writeSSE({ event: 'status', data: JSON.stringify(payload) }).catch(() => {});
          },
          close: cleanup,
        });

        c.req.raw.signal.addEventListener('abort', cleanup, { once: true });

        await s.write(`:connected ${connectionId}\n\n`);

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
