import { Hono } from 'hono';
import type { ContributionRegistry } from './registry.ts';
import { requestIdMiddleware } from './request-id.ts';

export function buildHonoApp(_reg: ContributionRegistry): Hono {
  const app = new Hono();
  app.use('*', requestIdMiddleware);
  app.get('/health/live', (c) => c.json({ ok: true }));
  return app;
}
