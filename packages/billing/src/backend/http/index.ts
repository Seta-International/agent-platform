import type { RouteBuildDeps, SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { registerBillingUsageRoutes } from './usage.ts';

export function buildBillingRoutes(_deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  registerBillingUsageRoutes(app);
  return app;
}
