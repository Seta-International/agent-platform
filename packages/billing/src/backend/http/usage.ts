import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { getTenantUsage } from '../domain/get-usage.ts';
import { requirePermission } from '../rbac.ts';

export function registerBillingUsageRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/billing/v1/usage', async (c) => {
    const session = c.get('user');
    requirePermission(session, 'billing.read');
    const usage = await getTenantUsage(session.tenant_id);
    return c.json(usage);
  });
}
