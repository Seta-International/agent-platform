import { and, eq } from 'drizzle-orm';
import type { Hono } from 'hono';
import { z } from 'zod';
import { copilotDb } from '../db/index.ts';
import { hitlCalls } from '../db/schema.ts';
import type { AgentName } from './agent-factory.ts';
import { copilotEnv } from './env.ts';
import { approveHitl, HitlError, rejectHitl } from './hitl.ts';
import { commitActualTokens, RateLimitError, reserveTurn } from './rate-limit.ts';
import { sse } from './sse.ts';
import { runWrappedTool } from './tool-runner.ts';

const ChatBody = z.object({
  threadId: z.string().optional(),
  message: z.object({ role: z.literal('user'), content: z.string().min(1) }),
  resourceId: z.string().optional(),
});

export type SessionLike = {
  tenant_id: string;
  user_id: string;
  effective_permissions: ReadonlySet<string>;
  role_summary: { roles: string[]; cross_tenant_read: boolean };
};

type StreamArgs = {
  messages: Array<{ role: 'user'; content: string }>;
  memory?: { thread?: string; resource?: string };
};

type StreamPart = {
  type?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
};

type AgentLike = {
  stream: (
    args: StreamArgs,
  ) => Promise<AsyncIterable<StreamPart> | { fullStream: AsyncIterable<StreamPart> }>;
};

export type CopilotRouteDeps = {
  factory: (session: SessionLike, agentName: AgentName) => AgentLike;
  mastra: unknown;
};

export type CopilotRouteEnv = { Variables: { session: SessionLike } };

function asAsyncIterable(
  result: AsyncIterable<StreamPart> | { fullStream: AsyncIterable<StreamPart> },
): AsyncIterable<StreamPart> {
  if (Symbol.asyncIterator in result) return result;
  return result.fullStream;
}

export function registerCopilotRoutes(app: Hono<CopilotRouteEnv>, deps: CopilotRouteDeps): void {
  app.post('/api/copilot/v1/chat/:agentName', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) {
      return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    }
    if (!session.effective_permissions.has('copilot.chat.use')) {
      return c.json({ error: 'forbidden', message: 'copilot.chat.use required' }, 403);
    }

    const agentName = c.req.param('agentName');
    if (agentName !== 'router' && agentName !== 'self') {
      return c.json({ error: 'not_found', message: 'unknown agent' }, 404);
    }

    const parsed = ChatBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json(
        { error: 'validation_failed', message: 'bad body', details: parsed.error.format() },
        400,
      );
    }

    try {
      await reserveTurn({
        tenantId: session.tenant_id,
        userId: session.user_id,
        estimatedTokens: Math.min(2_000, parsed.data.message.content.length * 4),
        turnLimit: copilotEnv.COPILOT_RATE_LIMIT_TURNS_PER_MIN,
        tpmLimit: copilotEnv.COPILOT_RATE_LIMIT_TPM,
      });
    } catch (e) {
      if (e instanceof RateLimitError) {
        c.header('Retry-After', String(Math.ceil(e.retryAfterSeconds)));
        return c.json({ error: 'rate_limited', message: e.message }, 429);
      }
      throw e;
    }

    const agent = deps.factory(session, agentName);
    const resourceId = parsed.data.resourceId ?? session.user_id;

    return sse(c, async (write) => {
      const result = await agent.stream({
        messages: [{ role: 'user', content: parsed.data.message.content }],
        memory: { thread: parsed.data.threadId, resource: resourceId },
      });
      const iterable = asAsyncIterable(result);

      let tokensIn = 0;
      let tokensOut = 0;
      for await (const part of iterable) {
        await write(part);
        if (part.type === 'finish' && part.usage) {
          tokensIn = part.usage.promptTokens ?? 0;
          tokensOut = part.usage.completionTokens ?? 0;
        }
      }

      if (tokensIn || tokensOut) {
        await commitActualTokens({
          tenantId: session.tenant_id,
          userId: session.user_id,
          tokensIn,
          tokensOut,
        });
      }
    });
  });

  type ThreadRow = {
    id: string;
    resourceId: string;
    title?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
    metadata?: Record<string, unknown>;
  };

  type ListThreadsArgs = { filter?: { resourceId?: string }; perPage?: number | false };
  type MemoryStore = {
    listThreads(args: ListThreadsArgs): Promise<{ threads: ThreadRow[] }>;
    getThreadById(q: { threadId: string; resourceId?: string }): Promise<ThreadRow | null>;
    updateThread(q: {
      id: string;
      title: string;
      metadata: Record<string, unknown>;
    }): Promise<ThreadRow>;
    deleteThread(q: { threadId: string }): Promise<void>;
    listMessages(q: { threadId: string }): Promise<{ messages: unknown[] }>;
  };

  const getMemoryStore = (): MemoryStore | null => {
    const m = deps.mastra as {
      getStorage?: () => { stores?: { memory?: MemoryStore } } | null;
    } | null;
    const storage = m?.getStorage ? m.getStorage() : null;
    return storage?.stores?.memory ?? null;
  };

  type PermDenied = { status: 401 | 403; body: { error: string; message: string } };

  const checkPerm = (
    session: SessionLike | undefined,
    perm: string,
  ): { ok: true; session: SessionLike } | { ok: false; denied: PermDenied } => {
    if (!session) {
      return {
        ok: false,
        denied: { status: 401, body: { error: 'unauthorized', message: 'session required' } },
      };
    }
    if (!session.effective_permissions.has(perm)) {
      return {
        ok: false,
        denied: { status: 403, body: { error: 'forbidden', message: `${perm} required` } },
      };
    }
    return { ok: true, session };
  };

  app.get('/api/copilot/v1/threads', async (c) => {
    const check = checkPerm(
      c.get('session') as SessionLike | undefined,
      'copilot.thread.read.self',
    );
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    const storage = getMemoryStore();
    if (!storage) return c.json({ threads: [] });
    const { threads } = await storage.listThreads({
      filter: { resourceId: check.session.user_id },
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

  app.get('/api/copilot/v1/threads/:id', async (c) => {
    const check = checkPerm(
      c.get('session') as SessionLike | undefined,
      'copilot.thread.read.self',
    );
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    const storage = getMemoryStore();
    const thread = storage ? await storage.getThreadById({ threadId: c.req.param('id') }) : null;
    if (!thread || thread.resourceId !== check.session.user_id) {
      return c.json({ error: 'not_found', message: 'thread not found' }, 404);
    }
    const messagesResult = storage
      ? await storage.listMessages({ threadId: thread.id })
      : { messages: [] };
    return c.json({ thread, messages: messagesResult.messages });
  });

  app.patch('/api/copilot/v1/threads/:id', async (c) => {
    const check = checkPerm(
      c.get('session') as SessionLike | undefined,
      'copilot.thread.write.self',
    );
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    const storage = getMemoryStore();
    const thread = storage ? await storage.getThreadById({ threadId: c.req.param('id') }) : null;
    if (!thread || thread.resourceId !== check.session.user_id) {
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

  app.delete('/api/copilot/v1/threads/:id', async (c) => {
    const check = checkPerm(
      c.get('session') as SessionLike | undefined,
      'copilot.thread.write.self',
    );
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    const storage = getMemoryStore();
    const thread = storage ? await storage.getThreadById({ threadId: c.req.param('id') }) : null;
    if (!thread || thread.resourceId !== check.session.user_id) {
      return c.json({ error: 'not_found', message: 'thread not found' }, 404);
    }
    if (storage) await storage.deleteThread({ threadId: thread.id });
    return c.json({ ok: true });
  });

  app.get('/api/copilot/v1/health', async (c) => {
    const modelConfigured = Boolean(copilotEnv.COPILOT_MODEL);
    let dbReachable = true;
    const storage = (deps.mastra as { getStorage: () => unknown }).getStorage();
    try {
      const maybePing = (storage as { ping?: () => Promise<void> } | null)?.ping;
      if (typeof maybePing === 'function') {
        await maybePing.call(storage);
      } else if (
        storage &&
        typeof (storage as { init?: () => Promise<void> }).init === 'function'
      ) {
        await (storage as { init: () => Promise<void> }).init();
      }
    } catch {
      dbReachable = false;
    }
    return c.json({
      status: modelConfigured && dbReachable ? 'ok' : 'degraded',
      model: { configured: modelConfigured },
      db: { reachable: dbReachable },
      mastra: { initialized: Boolean(storage) },
    });
  });

  app.post('/api/copilot/v1/hitl/:callId/approve', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    const callId = c.req.param('callId');
    const db = copilotDb();
    const [row] = await db
      .select()
      .from(hitlCalls)
      .where(and(eq(hitlCalls.callId, callId), eq(hitlCalls.userId, session.user_id)));
    if (!row) return c.json({ error: 'not_found', message: 'call not found' }, 404);
    if (!session.effective_permissions.has(row.requiredPermission)) {
      return c.json({ error: 'forbidden', message: `${row.requiredPermission} required` }, 403);
    }
    try {
      const outcome = await runWrappedTool(
        row.toolName,
        session,
        row.input as Record<string, unknown>,
      );
      const result = await approveHitl({ callId, userId: session.user_id, outcome });
      return c.json(result);
    } catch (e) {
      if (e instanceof HitlError && e.code === 'hitl_expired') {
        return c.json({ error: 'hitl_expired', message: e.message }, 409);
      }
      throw e;
    }
  });

  app.post('/api/copilot/v1/hitl/:callId/reject', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    const callId = c.req.param('callId');
    const body = (await c.req.json().catch(() => ({}))) as { note?: string };
    try {
      const result = await rejectHitl({ callId, userId: session.user_id, note: body.note });
      return c.json(result);
    } catch (e) {
      if (e instanceof HitlError && e.code === 'not_found') {
        return c.json({ error: 'not_found', message: e.message }, 404);
      }
      if (e instanceof HitlError && e.code === 'hitl_expired') {
        return c.json({ error: 'hitl_expired', message: e.message }, 409);
      }
      throw e;
    }
  });
}
