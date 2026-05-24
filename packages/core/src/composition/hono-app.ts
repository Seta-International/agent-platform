import { Hono } from 'hono';
import { registerErrorCapture } from './error-capture.ts';
import type { ContributionRegistry } from './registry.ts';
import { requestIdMiddleware } from './request-id.ts';

export function buildHonoApp(_reg: ContributionRegistry): Hono {
  const app = new Hono();
  app.use('*', requestIdMiddleware);
  registerErrorCapture(app);
  app.get('/health/live', (c) => c.json({ ok: true }));
  return app;
}
