import type { Hono } from 'hono';
import { TenantGuardedMastraStore } from '../mastra-store/tenant-guarded-store.ts';
import {
  type AgentRouteDeps,
  type AgentRouteEnv,
  checkPerm,
  toUIMessage,
  type UIMessageLike,
} from './_shared.ts';

export function mountThreadRoutes(app: Hono<AgentRouteEnv>, deps: AgentRouteDeps): void {
  const store = new TenantGuardedMastraStore(deps.mastra);

  app.get('/api/agent/v1/threads', async (c) => {
    const check = checkPerm(
      c.get('session') as import('../types.ts').SessionLike | undefined,
      'agent.thread.read',
    );
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    const { threads } = await store.listThreadsForUser(
      check.session.tenant_id,
      check.session.user_id,
    );
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
      'agent.thread.read',
    );
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    const thread = await store.getThreadChecked(
      check.session.tenant_id,
      check.session.user_id,
      c.req.param('id'),
    );
    if (!thread) {
      return c.json({ error: 'not_found', message: 'thread not found' }, 404);
    }
    const pageRaw = c.req.query('page');
    const perPageRaw = c.req.query('perPage');
    const page = pageRaw ? Math.max(0, Number.parseInt(pageRaw, 10)) : 0;
    const perPage = perPageRaw ? Math.min(200, Math.max(1, Number.parseInt(perPageRaw, 10))) : 50;
    const result = await store.listThreadMessages(thread.id, { page, perPage });
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
      'agent.thread.write',
    );
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    const thread = await store.getThreadChecked(
      check.session.tenant_id,
      check.session.user_id,
      c.req.param('id'),
    );
    if (!thread) {
      return c.json({ error: 'not_found', message: 'thread not found' }, 404);
    }
    const body = (await c.req.json().catch(() => ({}))) as { title?: string };
    if (body.title) {
      await store.updateThread(thread.id, { title: body.title, metadata: thread.metadata ?? {} });
    }
    return c.json({ ok: true });
  });

  app.delete('/api/agent/v1/threads/:id', async (c) => {
    const check = checkPerm(
      c.get('session') as import('../types.ts').SessionLike | undefined,
      'agent.thread.write',
    );
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    const thread = await store.getThreadChecked(
      check.session.tenant_id,
      check.session.user_id,
      c.req.param('id'),
    );
    if (!thread) {
      return c.json({ error: 'not_found', message: 'thread not found' }, 404);
    }
    await store.deleteThread(thread.id);
    return c.json({ ok: true });
  });
}
