import type { Client } from '@microsoft/microsoft-graph-client';
import { addEventTap, type SessionEnv, type SessionScope } from '@seta/core';
import type { WorkerHandle } from '@seta/core/runtime';
import { m365 } from '@seta/integrations';
import {
  linkGroupToM365,
  PlannerError,
  requirePermission,
  resolveGroupConflict,
  unlinkGroupFromM365,
} from '@seta/planner';
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

const HEARTBEAT_INTERVAL_MS = 30_000;

interface IntegrationsM365Deps {
  graphClientFor: (tenantId: string) => Promise<Client>;
  workers: WorkerHandle;
  m365LinksRepo: m365.M365GroupLinkRepo;
}

function hasGroupAccess(session: SessionScope, groupId: string): boolean {
  return (
    session.accessible_group_ids.includes(groupId) ||
    session.role_summary.roles.includes('org.admin') ||
    session.role_summary.roles.includes('tenant.admin')
  );
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

  app.post('/api/integrations/m365/groups/:groupId/resolve', async (c) => {
    const session = c.get('user');
    const groupId = c.req.param('groupId');
    const body = await c.req.json<{
      decisions: Array<{ field: string; choice: 'local' | 'remote' }>;
    }>();
    await resolveGroupConflict(
      { group_id: groupId, decisions: body?.decisions ?? [], session },
      {
        getLink: (gid) => deps.m365LinksRepo.findByGroup(gid),
        setSyncStatus: (id, status) => deps.m365LinksRepo.setSyncStatus(id, status),
        enqueueGroupPush: (payload) => deps.workers.addJob('m365.group.push', payload),
      },
    );
    return c.json({ ok: true });
  });

  app.get('/api/integrations/m365/groups/:groupId/sync-status', async (c) => {
    const session = c.get('user');
    const groupId = c.req.param('groupId');

    if (!hasGroupAccess(session, groupId)) {
      return c.json({ error: 'FORBIDDEN' }, 403);
    }

    const link = await deps.m365LinksRepo.findByGroup(groupId);
    if (!link) {
      return c.json({ sync_status: null });
    }
    return c.json({
      sync_status: link.syncStatus,
      synced_at: link.lastSyncedAt,
      last_error: link.lastError,
    });
  });

  app.get('/api/integrations/m365/groups/:groupId/sync-status/stream', async (c) => {
    const session = c.get('user');
    const groupId = c.req.param('groupId');

    if (!hasGroupAccess(session, groupId)) {
      return c.json({ error: 'FORBIDDEN' }, 403);
    }

    let cleanup: (() => void) | undefined;

    return streamSSE(
      c,
      async (s) => {
        const heartbeat = setInterval(() => {
          s.write(':keepalive\n\n').catch(() => {});
        }, HEARTBEAT_INTERVAL_MS);

        const pushCurrentStatus = async () => {
          try {
            const link = await deps.m365LinksRepo.findByGroup(groupId);
            await s
              .writeSSE({
                event: 'sync-status',
                data: JSON.stringify(
                  link
                    ? {
                        sync_status: link.syncStatus,
                        synced_at: link.lastSyncedAt,
                        last_error: link.lastError,
                      }
                    : { sync_status: null },
                ),
              })
              .catch(() => {});
          } catch {
            // repo failure — skip this update; stream remains open
          }
        };

        const unsub = addEventTap(
          (e) =>
            (e.eventType === 'integrations.m365.group.field-conflict' ||
              e.eventType === 'planner.group.updated') &&
            (e.payload as { group_id?: string })?.group_id === groupId,
          () => {
            void pushCurrentStatus();
          },
        );

        cleanup = () => {
          clearInterval(heartbeat);
          unsub();
        };

        if (c.req.raw.signal.aborted) {
          cleanup();
          return;
        }
        c.req.raw.signal.addEventListener('abort', cleanup, { once: true });

        await pushCurrentStatus();

        await new Promise<void>((resolve) => {
          if (c.req.raw.signal.aborted) {
            resolve();
            return;
          }
          c.req.raw.signal.addEventListener('abort', () => resolve(), { once: true });
        });
      },
      async (_err, _s) => {
        cleanup?.();
      },
    );
  });
}
