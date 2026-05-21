import type { Client } from '@microsoft/microsoft-graph-client';
import type { SessionEnv } from '@seta/core';
import { m365 } from '@seta/integrations';
import { PlannerError, requirePermission } from '@seta/planner';
import type { Hono } from 'hono';

interface IntegrationsM365Deps {
  graphClientFor: (tenantId: string) => Promise<Client>;
}

export function registerIntegrationsM365Routes(
  app: Hono<SessionEnv>,
  deps: IntegrationsM365Deps,
): void {
  app.get('/api/integrations/m365/groups/search', async (c) => {
    const session = c.get('user');
    requirePermission(session, 'planner.group.link.m365');

    const q = c.req.query('q') ?? '';
    const safeQ = q.replace(/["'\\]/g, '').trim();
    if (!safeQ || safeQ.length < 2) return c.json({ groups: [] });

    const graphClient = await deps.graphClientFor(session.tenant_id).catch((err) => {
      if (err instanceof m365.M365NotConfiguredError)
        throw new PlannerError('VALIDATION', 'M365 is not configured for this tenant');
      throw err;
    });
    const res = await graphClient
      .api('/groups')
      .header('ConsistencyLevel', 'eventual')
      .search(`"displayName:${safeQ}"`)
      .select('id,displayName,mailNickname')
      .top(20)
      .get();

    const groups = (
      res.value as Array<{ id: string; displayName: string; mailNickname: string }>
    ).map((g) => ({
      external_id: g.id,
      display_name: g.displayName,
      mail_nickname: g.mailNickname,
    }));

    return c.json({ groups });
  });
}
