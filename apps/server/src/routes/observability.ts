import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';

export function registerObservabilityRoutes(app: Hono<SessionEnv>): void {
  app.post('/api/observability/v1/web-vitals', (c) => c.body(null, 204));
}
