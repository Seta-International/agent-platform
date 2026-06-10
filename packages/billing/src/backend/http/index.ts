import type { RouteBuildDeps, SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { registerBillingPricingRoutes } from './pricing.ts';
import { registerBillingUsageRoutes } from './usage.ts';

export function buildBillingRoutes(_deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  registerBillingUsageRoutes(app);
  registerBillingPricingRoutes(app);
  return app;
}
