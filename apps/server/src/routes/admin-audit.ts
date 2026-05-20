import type { SessionEnv } from '@seta/core';
import { queryAudit } from '@seta/core/backend';
import { IdentityError } from '@seta/identity';
import type { Context, Hono } from 'hono';

function requireAuditRead(c: Context<SessionEnv>): void {
  const scope = c.get('user');
  if (!scope.role_summary.roles.includes('org.admin')) {
    throw new IdentityError('FORBIDDEN', 'core.audit.read required');
  }
}

export function registerAdminAuditRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/identity/v1/audit', async (c) => {
    requireAuditRead(c);
    const scope = c.get('user');
    const event_type = c.req.query('event_type');
    const aggregate_id = c.req.query('aggregate_id');
    const from = c.req.query('from');
    const to = c.req.query('to');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    const result = await queryAudit({
      tenant_id: scope.tenant_id,
      event_type: event_type || undefined,
      aggregate_id: aggregate_id || undefined,
      from: from || undefined,
      to: to || undefined,
      limit,
      offset,
    });

    return c.json(result);
  });
}
