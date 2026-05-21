import type { Client } from '@microsoft/microsoft-graph-client';
import type { SessionEnv } from '@seta/core';
import type { WorkerHandle } from '@seta/core/workers';
import { m365 } from '@seta/integrations';
import {
  linkGroupToM365,
  PlannerError,
  requirePermission,
  unlinkGroupFromM365,
} from '@seta/planner';
import type { Hono } from 'hono';

interface IntegrationsM365Deps {
  graphClientFor: (tenantId: string) => Promise<Client>;
  workers: WorkerHandle;
  m365LinksRepo: m365.M365GroupLinkRepo;
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

  app.post('/api/integrations/m365/groups/:groupId/link', async (c) => {
    const session = c.get('user');
    const groupId = c.req.param('groupId');
    const body = await c.req.json<{ external_id: string }>();

    if (!body?.external_id?.trim()) {
      return c.json({ error: 'VALIDATION', message: 'external_id is required' }, 400);
    }

    const group = await linkGroupToM365({
      group_id: groupId,
      external_id: body.external_id,
      session,
    });

    await deps.workers.addJob('m365.group.pull', {
      tenant_id: session.tenant_id,
      group_id: groupId,
      external_id: body.external_id,
      full: true,
    });

    return c.json(group, 201);
  });

  app.post('/api/integrations/m365/groups/:groupId/unlink', async (c) => {
    const session = c.get('user');
    const groupId = c.req.param('groupId');

    const group = await unlinkGroupFromM365({ group_id: groupId, session });

    return c.json(group, 200);
  });

  app.post('/api/integrations/m365/groups/:groupId/refresh', async (c) => {
    const session = c.get('user');
    const groupId = c.req.param('groupId');

    requirePermission(session, 'planner.group.refresh', groupId);

    const link = (await deps.m365LinksRepo.findByGroup(groupId)) ?? null;
    if (!link) {
      return c.json({ error: 'NOT_LINKED' }, 409);
    }

    await deps.workers.addJob('m365.group.pull', {
      tenant_id: link.tenantId,
      group_id: groupId,
      external_id: link.externalId,
    });

    return c.json({ ok: true });
  });
}
