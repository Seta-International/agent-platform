import { toAISdkStream } from '@mastra/ai-sdk';
import type { Mastra } from '@mastra/core';
import { RequestContext } from '@mastra/core/request-context';
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from 'ai';
import type { Context, Hono } from 'hono';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { AgentFactory } from './agent-factory.ts';
import { cancelWorkflowRun } from './domain/cancel-workflow-run.ts';
import { decideApproval } from './domain/decide-approval.ts';
import { getWorkflowRun } from './domain/get-workflow-run.ts';
import { getWorkflowRunSnapshot } from './domain/get-workflow-run-snapshot.ts';
import { listMyPendingApprovals } from './domain/list-my-pending-approvals.ts';
import { listWorkflowRuns } from './domain/list-workflow-runs.ts';
import { replayWorkflowFromStep } from './domain/replay-workflow-from-step.ts';
import { rerunWorkflow } from './domain/rerun-workflow.ts';
import { copilotEnv } from './env.ts';
import { listModels, ModelNotFoundError, resolveModel } from './model-registry.ts';
import { RateLimitError, reserveTurn } from './rate-limit.ts';
import type { SessionLike } from './types.ts';
import { issueSseToken } from './workflows/_infra/auth-token.ts';
import { getWorkflowInputSchema } from './workflows/_infra/input-schema-registry.ts';
import { mountInboxSse } from './workflows/_infra/sse-inbox.ts';
import { mountRunSse } from './workflows/_infra/sse-run.ts';

function handleDomainError(c: Context<CopilotRouteEnv>, err: unknown): Response {
  if (err && typeof err === 'object' && 'code' in err) {
    const typed = err as { code: string; message?: string };
    const code = typed.code;
    const message = typed.message ?? code;
    if (code === 'forbidden') return c.json({ error: 'forbidden', message }, 403);
    if (code === 'not_found') return c.json({ error: 'not_found', message }, 404);
    if (code === 'already_decided') return c.json({ error: 'already_decided', message }, 409);
    if (code === 'invalid_cursor') return c.json({ error: 'invalid_cursor', message }, 400);
  }
  throw err;
}

const ChatBody = z.object({
  id: z.string().optional(),
  messages: z.array(z.unknown()).min(1),
  trigger: z.enum(['submit-message', 'regenerate-message']).optional(),
  resourceId: z.string().optional(),
  model: z.string().optional(),
});

export type CopilotRouteDeps = {
  factory: AgentFactory;
  mastra: unknown;
  pool: Pool;
};

export type CopilotRouteEnv = { Variables: { session: SessionLike } };

function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'user') {
      const text = (m.parts ?? [])
        .filter(
          (p): p is Extract<UIMessage['parts'][number], { type: 'text' }> => p.type === 'text',
        )
        .map((p) => p.text)
        .join(' ');
      if (text) return text;
    }
  }
  return '';
}

type PageContextPart = {
  type: 'data-page-context';
  id?: string;
  data: { kind: string; id: string; label: string; summary?: string };
};

function isPageContextPart(p: unknown): p is PageContextPart {
  if (!p || typeof p !== 'object') return false;
  const part = p as { type?: unknown; data?: unknown };
  if (part.type !== 'data-page-context') return false;
  const d = part.data as { kind?: unknown; id?: unknown; label?: unknown } | undefined;
  return (
    !!d && typeof d.kind === 'string' && typeof d.id === 'string' && typeof d.label === 'string'
  );
}

function injectContextPrefix(messages: UIMessage[]): UIMessage[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== 'user') continue;
    const ctx = (m.parts ?? []).find(isPageContextPart);
    if (!ctx) return messages;
    const prefix = ctx.data.summary
      ? `[Context: ${ctx.data.kind}#${ctx.data.id} — "${ctx.data.label}"\nSummary: ${ctx.data.summary}]\n\n`
      : `[Context: ${ctx.data.kind}#${ctx.data.id} — "${ctx.data.label}"]\n\n`;
    const originalParts = m.parts ?? [];
    let injected = false;
    const nextParts = originalParts.map((p) => {
      if (!injected && p.type === 'text') {
        injected = true;
        return { ...p, text: `${prefix}${(p as { text: string }).text}` };
      }
      return p;
    });
    if (!injected) {
      nextParts.unshift({ type: 'text', text: prefix.trimEnd() } as never);
    }
    const cloned = { ...m, parts: nextParts } as UIMessage;
    return messages.map((mm, idx) => (idx === i ? cloned : mm));
  }
  return messages;
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
    const session_agents = deps.factory(session);
    const agent = session_agents.get(agentName);
    if (!agent) {
      return c.json({ error: 'not_found', message: 'unknown agent' }, 404);
    }

    const parsed = ChatBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json(
        { error: 'validation_failed', message: 'bad body', details: parsed.error.format() },
        400,
      );
    }

    const messages = parsed.data.messages as UIMessage[];
    const effectiveMessages = injectContextPrefix(messages);
    const userText = lastUserText(effectiveMessages);

    try {
      await reserveTurn({
        tenantId: session.tenant_id,
        userId: session.user_id,
        estimatedTokens: Math.min(2_000, Math.max(50, userText.length * 4)),
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

    const spec = session_agents.specs().find((s) => s.name === agentName);
    const resourceId = parsed.data.resourceId ?? session.user_id;

    let modelOverride: ReturnType<typeof resolveModel>['model'] | undefined;
    try {
      modelOverride = resolveModel(parsed.data.model, {
        tierHint: spec?.defaultTier,
        lastUserText: userText,
      }).model;
    } catch (e) {
      if (e instanceof ModelNotFoundError) {
        return c.json({ error: 'unknown_model', message: e.message }, 400);
      }
      throw e;
    }

    const requestContext = new RequestContext();
    requestContext.set('actor', {
      type: 'user' as const,
      user_id: session.user_id,
    });

    const result = await agent.stream(
      effectiveMessages as never,
      {
        ...(parsed.data.id
          ? { memory: { thread: parsed.data.id, resource: resourceId } }
          : { memory: { resource: resourceId } }),
        requestContext,
        ...(modelOverride ? { model: modelOverride as never } : {}),
      } as never,
    );

    const uiStream = createUIMessageStream({
      originalMessages: effectiveMessages,
      execute: async ({ writer }) => {
        const stream = toAISdkStream(result as never, {
          from: 'agent',
          version: 'v6',
        }) as ReadableStream<unknown>;
        const reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            writer.write(value as never);
          }
        } finally {
          reader.releaseLock();
        }
      },
    });
    return createUIMessageStreamResponse({ stream: uiStream });
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
  type MastraStoredMessage = {
    id?: string;
    role?: string;
    content?: unknown;
    createdAt?: Date | string;
  };
  type MemoryStore = {
    listThreads(args: ListThreadsArgs): Promise<{ threads: ThreadRow[] }>;
    getThreadById(q: { threadId: string; resourceId?: string }): Promise<ThreadRow | null>;
    updateThread(q: {
      id: string;
      title: string;
      metadata: Record<string, unknown>;
    }): Promise<ThreadRow>;
    deleteThread(q: { threadId: string }): Promise<void>;
    listMessages(q: {
      threadId: string;
      page?: number;
      perPage?: number;
    }): Promise<{ messages: MastraStoredMessage[]; total?: number; hasMore?: boolean }>;
  };

  type TextUIPart = { type: 'text'; text: string };
  type ReasoningUIPart = { type: 'reasoning'; text: string };
  type ToolUIPart = {
    type: `tool-${string}`;
    toolCallId: string;
    state: 'output-available' | 'output-error' | 'input-available';
    input: unknown;
    output?: unknown;
    errorText?: string;
  };
  type DataPageContextPart = {
    type: 'data-page-context';
    id: string;
    data: { kind: string; id: string; label: string; summary?: string };
  };
  type UIMessagePart = TextUIPart | ReasoningUIPart | ToolUIPart | DataPageContextPart;
  type UIMessageLike = { id: string; role: 'user' | 'assistant'; parts: UIMessagePart[] };

  // Mastra stores tool calls as `{ type:'tool-invocation', toolInvocation }`; ai@6 wants
  // `{ type:'tool-<name>', state, input, output }`. Translate at the read boundary.
  type MastraToolInvocation = {
    toolCallId?: unknown;
    toolName?: unknown;
    state?: unknown;
    args?: unknown;
    result?: unknown;
    errorText?: unknown;
  };

  function mastraPartToUIPart(raw: unknown): UIMessagePart | null {
    if (!raw || typeof raw !== 'object') return null;
    const type = (raw as { type?: unknown }).type;
    if (type === 'text') {
      const text = (raw as { text?: unknown }).text;
      return typeof text === 'string' && text.length > 0 ? { type: 'text', text } : null;
    }
    if (type === 'reasoning') {
      const text = (raw as { text?: unknown }).text;
      return typeof text === 'string' && text.length > 0 ? { type: 'reasoning', text } : null;
    }
    if (type === 'tool-invocation') {
      const i = (raw as { toolInvocation?: MastraToolInvocation }).toolInvocation;
      if (!i || typeof i.toolCallId !== 'string' || typeof i.toolName !== 'string') return null;
      const hasError = typeof i.errorText === 'string';
      const hasResult = i.result !== undefined;
      const state: ToolUIPart['state'] = hasError
        ? 'output-error'
        : hasResult
          ? 'output-available'
          : 'input-available';
      const part: ToolUIPart = {
        type: `tool-${i.toolName}`,
        toolCallId: i.toolCallId,
        state,
        input: i.args,
      };
      if (state === 'output-available') part.output = i.result;
      if (state === 'output-error') part.errorText = (i.errorText as string) ?? 'tool failed';
      return part;
    }
    if (type === 'data-page-context') {
      const r = raw as { id?: unknown; data?: unknown };
      const d = r.data as
        | { kind?: unknown; id?: unknown; label?: unknown; summary?: unknown }
        | undefined;
      if (
        !d ||
        typeof d.kind !== 'string' ||
        typeof d.id !== 'string' ||
        typeof d.label !== 'string'
      ) {
        return null;
      }
      const summary = typeof d.summary === 'string' ? d.summary : undefined;
      const id = typeof r.id === 'string' ? r.id : `${d.kind}-${d.id}`;
      return {
        type: 'data-page-context' as const,
        id,
        data: { kind: d.kind, id: d.id, label: d.label, ...(summary ? { summary } : {}) },
      };
    }
    return null;
  }

  function toUIMessage(m: MastraStoredMessage, idx: number): UIMessageLike | null {
    const role = m.role === 'user' || m.role === 'assistant' ? m.role : null;
    if (!role) return null;
    const content = m.content;
    if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
    const stored = content as { parts?: unknown };
    if (!Array.isArray(stored.parts)) return null;
    const parts: UIMessagePart[] = [];
    for (const raw of stored.parts) {
      const p = mastraPartToUIPart(raw);
      if (p) parts.push(p);
    }
    if (parts.length === 0) return null;
    return { id: m.id ?? `msg-${idx}`, role, parts };
  }

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

  app.get('/api/copilot/v1/agents', async (c) => {
    const check = checkPerm(c.get('session') as SessionLike | undefined, 'copilot.chat.use');
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    const agents = deps.factory.specs
      .filter((s) => s.userVisible !== false)
      .map((s) => ({
        name: s.name,
        label: s.label,
        description: s.description,
        delegates: s.delegates ?? [],
      }));
    return c.json({ agents, default: agents[0]?.name ?? null });
  });

  app.get('/api/copilot/v1/tools', async (c) => {
    const check = checkPerm(c.get('session') as SessionLike | undefined, 'copilot.chat.use');
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    return c.json({ tools: deps.factory.toolCatalog });
  });

  app.get('/api/copilot/v1/models', async (c) => {
    const check = checkPerm(c.get('session') as SessionLike | undefined, 'copilot.chat.use');
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    const { models, default: defaultKey } = listModels();
    const withAuto = [
      {
        key: 'auto',
        label: 'Auto',
        tier: 'auto' as const,
        supportsReasoning: models.some((m) => m.supportsReasoning),
      },
      ...models,
    ];
    return c.json({ models: withAuto, default: defaultKey });
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

  const ApproveBody = z.object({
    runId: z.string().min(1),
    toolCallId: z.string().min(1),
    approved: z.boolean(),
    threadId: z.string().optional(),
  });

  app.post('/api/copilot/v1/chat/:agentName/approve', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) {
      return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    }
    if (!session.effective_permissions.has('copilot.chat.use')) {
      return c.json({ error: 'forbidden', message: 'copilot.chat.use required' }, 403);
    }

    const agentName = c.req.param('agentName');
    const sessionAgents = deps.factory(session);
    const agent = sessionAgents.get(agentName);
    if (!agent) {
      return c.json({ error: 'not_found', message: 'unknown agent' }, 404);
    }

    const parsed = ApproveBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json(
        { error: 'validation_failed', message: 'bad body', details: parsed.error.format() },
        400,
      );
    }

    const requestContext = new RequestContext();
    requestContext.set('actor', {
      type: 'user' as const,
      user_id: session.user_id,
    });

    const resourceId = session.user_id;
    const resumeOpts = {
      runId: parsed.data.runId,
      toolCallId: parsed.data.toolCallId,
      ...(parsed.data.threadId
        ? { memory: { thread: parsed.data.threadId, resource: resourceId } }
        : { memory: { resource: resourceId } }),
      requestContext,
    } as never;

    let result: unknown;
    try {
      result = parsed.data.approved
        ? await (agent as { approveToolCall: (o: never) => Promise<unknown> }).approveToolCall(
            resumeOpts,
          )
        : await (agent as { declineToolCall: (o: never) => Promise<unknown> }).declineToolCall(
            resumeOpts,
          );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: 'resume_failed', message: msg }, 500);
    }

    const uiStream = createUIMessageStream({
      execute: async ({ writer }) => {
        const stream = toAISdkStream(result as never, {
          from: 'agent',
          version: 'v6',
        }) as ReadableStream<unknown>;
        const reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            writer.write(value as never);
          }
        } finally {
          reader.releaseLock();
        }
      },
    });
    return createUIMessageStreamResponse({ stream: uiStream });
  });

  mountInboxSse(app as unknown as Hono, { pool: deps.pool });
  mountRunSse(app as unknown as Hono, { pool: deps.pool, mastra: deps.mastra as Mastra });

  app.get('/api/copilot/v1/workflows/runs', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    const url = new URL(c.req.url);
    const scopeRaw = url.searchParams.get('scope') ?? 'self';
    if (
      scopeRaw !== 'self' &&
      scopeRaw !== 'group' &&
      scopeRaw !== 'tenant' &&
      scopeRaw !== 'instance'
    ) {
      return c.json(
        { error: 'invalid_scope', message: 'scope must be self|group|tenant|instance' },
        400,
      );
    }
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitStr = url.searchParams.get('limit');
    const limit = limitStr ? Number(limitStr) : undefined;
    if (limit !== undefined && !Number.isFinite(limit)) {
      return c.json({ error: 'invalid_limit', message: 'limit must be a number' }, 400);
    }
    const workflowId = url.searchParams.get('workflowId') ?? undefined;
    try {
      const result = await listWorkflowRuns({
        session,
        scope: scopeRaw,
        cursor,
        limit,
        filters: workflowId ? { workflowId } : undefined,
      });
      return c.json(result);
    } catch (err) {
      return handleDomainError(c, err);
    }
  });

  app.get('/api/copilot/v1/workflows/runs/:runId', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    try {
      const row = await getWorkflowRun({ session, runId: c.req.param('runId') });
      if (!row) return c.json({ error: 'not_found', message: 'workflow run not found' }, 404);
      return c.json(row);
    } catch (err) {
      return handleDomainError(c, err);
    }
  });

  app.get('/api/copilot/v1/workflows/runs/:runId/snapshot', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    try {
      const snap = await getWorkflowRunSnapshot({
        session,
        runId: c.req.param('runId'),
        mastra: deps.mastra as Mastra,
      });
      if (!snap) return c.json({ error: 'not_found', message: 'snapshot not found' }, 404);
      return c.json(snap);
    } catch (err) {
      return handleDomainError(c, err);
    }
  });

  app.get('/api/copilot/v1/workflows/my-pending-approvals', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    return c.json(await listMyPendingApprovals({ session }));
  });

  app.post('/api/copilot/v1/workflows/approvals/:approvalId/decide', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    let body: { decision: 'approve' | 'reject' | 'modify'; overrideUserId?: string; note?: string };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ error: 'invalid_body', message: 'JSON body required' }, 400);
    }
    if (body.decision !== 'approve' && body.decision !== 'reject' && body.decision !== 'modify') {
      return c.json(
        { error: 'invalid_decision', message: 'decision must be approve|reject|modify' },
        400,
      );
    }
    try {
      const result = await decideApproval({
        session,
        approvalId: c.req.param('approvalId'),
        decision: body.decision,
        overrideUserId: body.overrideUserId,
        note: body.note,
        mastra: deps.mastra as Mastra,
      });
      return c.json(result);
    } catch (err) {
      return handleDomainError(c, err);
    }
  });

  app.post('/api/copilot/v1/workflows/runs/:runId/rerun', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    const raw = (await c.req.json().catch(() => ({}))) as {
      inputOverride?: Record<string, unknown>;
    };
    try {
      const result = await rerunWorkflow({
        session,
        runId: c.req.param('runId'),
        inputOverride: raw.inputOverride,
        mastra: deps.mastra as Mastra,
      });
      return c.json(result);
    } catch (err) {
      return handleDomainError(c, err);
    }
  });

  app.post('/api/copilot/v1/workflows/runs/:runId/replay-from-step', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    const raw = (await c.req.json().catch(() => ({}))) as {
      stepId?: string;
      payload?: Record<string, unknown>;
    };
    if (!raw.stepId || typeof raw.stepId !== 'string') {
      return c.json({ error: 'bad_request', message: 'stepId is required' }, 400);
    }
    try {
      const result = await replayWorkflowFromStep({
        session,
        runId: c.req.param('runId'),
        stepId: raw.stepId,
        payload: raw.payload ?? {},
        mastra: deps.mastra as Mastra,
      });
      return c.json(result);
    } catch (err) {
      return handleDomainError(c, err);
    }
  });

  app.post('/api/copilot/v1/workflows/runs/:runId/cancel', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    try {
      await cancelWorkflowRun({
        session,
        runId: c.req.param('runId'),
        mastra: deps.mastra as Mastra,
      });
      return c.json({ ok: true });
    } catch (err) {
      return handleDomainError(c, err);
    }
  });

  app.get('/api/copilot/v1/workflows/:workflowId/input-schema', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    const schema = getWorkflowInputSchema(c.req.param('workflowId'));
    if (!schema) {
      return c.json({ error: 'not_found', message: 'unknown workflow id' }, 404);
    }
    return c.json(schema);
  });

  app.get('/api/copilot/v1/workflows/sse-token', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    return c.json({
      token: issueSseToken({ userId: session.user_id, tenantId: session.tenant_id }),
    });
  });
}
