import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { listModelPrices } from '../domain/model-pricing.ts';
import { requirePermission } from '../rbac.ts';

export function registerBillingPricingRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/billing/v1/pricing', async (c) => {
    const session = c.get('user');
    requirePermission(session, 'billing.read');
    const pricing = await listModelPrices();
    return c.json({ pricing });
  });
}
