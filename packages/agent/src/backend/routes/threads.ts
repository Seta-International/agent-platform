import type { Hono } from 'hono';
import {
  type AgentRouteDeps,
  type AgentRouteEnv,
  checkPerm,
  getMemoryStore,
  toUIMessage,
  type UIMessageLike,
} from './_shared.ts';

export function mountThreadRoutes(app: Hono<AgentRouteEnv>, deps: AgentRouteDeps): void {
  app.get('/api/agent/v1/threads', async (c) => {
    const check = checkPerm(
      c.get('session') as import('../types.ts').SessionLike | undefined,
      'agent.thread.read.self',
    );
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    const storage = getMemoryStore(deps.mastra);
    if (!storage) return c.json({ threads: [] });
    const { threads } = await storage.listThreads({
      filter: { resourceId: `${check.session.tenant_id}:${check.session.user_id}` },
      perPage: 100,
    });
    return c.json({
      threads: threads.map((t) => ({
        id: t.id,
        title: t.title ?? null,
        updatedAt: t.updatedAt ?? null,
      })),
    });
  });

  app.get('/api/agent/v1/threads/:id', async (c) => {
    const check = checkPerm(
      c.get('session') as import('../types.ts').SessionLike | undefined,
      'agent.thread.read.self',
    );
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    const storage = getMemoryStore(deps.mastra);
    const thread = storage ? await storage.getThreadById({ threadId: c.req.param('id') }) : null;
    if (!thread || thread.resourceId !== `${check.session.tenant_id}:${check.session.user_id}`) {
      return c.json({ error: 'not_found', message: 'thread not found' }, 404);
    }
    const pageRaw = c.req.query('page');
    const perPageRaw = c.req.query('perPage');
    const page = pageRaw ? Math.max(0, Number.parseInt(pageRaw, 10)) : 0;
    const perPage = perPageRaw ? Math.min(200, Math.max(1, Number.parseInt(perPageRaw, 10))) : 50;
    const result = storage
      ? await storage.listMessages({ threadId: thread.id, page, perPage })
      : { messages: [], total: 0, hasMore: false };
    const uiMessages = result.messages
      .map((m, i) => toUIMessage(m, i))
      .filter((m): m is UIMessageLike => m !== null);
    return c.json({
      thread: { id: thread.id, title: thread.title ?? null, updatedAt: thread.updatedAt ?? null },
      messages: uiMessages,
      page,
      perPage,
      total: result.total ?? uiMessages.length,
      hasMore: result.hasMore ?? false,
    });
  });

  app.patch('/api/agent/v1/threads/:id', async (c) => {
    const check = checkPerm(
      c.get('session') as import('../types.ts').SessionLike | undefined,
      'agent.thread.write.self',
    );
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    const storage = getMemoryStore(deps.mastra);
    const thread = storage ? await storage.getThreadById({ threadId: c.req.param('id') }) : null;
    if (!thread || thread.resourceId !== `${check.session.tenant_id}:${check.session.user_id}`) {
      return c.json({ error: 'not_found', message: 'thread not found' }, 404);
    }
    const body = (await c.req.json().catch(() => ({}))) as { title?: string };
    if (body.title && storage) {
      await storage.updateThread({
        id: thread.id,
        title: body.title,
        metadata: thread.metadata ?? {},
      });
    }
    return c.json({ ok: true });
  });

  app.delete('/api/agent/v1/threads/:id', async (c) => {
    const check = checkPerm(
      c.get('session') as import('../types.ts').SessionLike | undefined,
      'agent.thread.write.self',
    );
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    const storage = getMemoryStore(deps.mastra);
    const thread = storage ? await storage.getThreadById({ threadId: c.req.param('id') }) : null;
    if (!thread || thread.resourceId !== `${check.session.tenant_id}:${check.session.user_id}`) {
      return c.json({ error: 'not_found', message: 'thread not found' }, 404);
    }
    if (storage) await storage.deleteThread({ threadId: thread.id });
    return c.json({ ok: true });
  });
}
