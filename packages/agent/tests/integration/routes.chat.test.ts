import { ReadableStream } from 'node:stream/web';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import type { ChatStreamRun } from '@seta/shared-orchestration';
import { Hono } from 'hono';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { registerAgentRoutes } from '../../src/backend/routes.ts';
import { withAgentTestDb } from '../helpers.ts';

type TestSession = {
  tenant_id: string;
  user_id: string;
  effective_permissions: ReadonlySet<string>;
  role_summary: { roles: string[]; cross_tenant_read: boolean };
};

const fakeMastra = { getStorage: () => null } as never;
const fakePool = {
  connect: async () => {
    throw new Error('no pool in unit test');
  },
} as unknown as Pool;

const TRUST = { reasoningTrace: [], evidenceCitations: [], confidenceScore: 0.8 };

/** A minimal MastraModelOutput stand-in: `toAISdkStream({ from:'agent' })` reads
 *  only `.fullStream` (a web ReadableStream of Mastra chunks). We emit the text
 *  start/delta/end + finish chunks the AgentStream→AI-SDK-v6 transformer expects. */
function fakeOutput(textChunks: string[] = []) {
  const chunks: unknown[] = [];
  if (textChunks.length) {
    chunks.push({ type: 'text-start', runId: 'r', from: 'AGENT', payload: { id: 't' } });
    for (const t of textChunks) {
      chunks.push({ type: 'text-delta', runId: 'r', from: 'AGENT', payload: { id: 't', text: t } });
    }
    chunks.push({ type: 'text-end', runId: 'r', from: 'AGENT', payload: { id: 't' } });
  }
  chunks.push({
    type: 'finish',
    runId: 'r',
    from: 'AGENT',
    payload: { stepResult: { reason: 'stop' }, output: { usage: {} } },
  });
  return {
    fullStream: new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(c);
        controller.close();
      },
    }),
  };
}

function fakeChatRun(opts: { text?: string[]; result?: unknown } = {}): ChatStreamRun {
  return {
    output: fakeOutput(opts.text) as unknown as ChatStreamRun['output'],
    finalize: async () => ({ result: opts.result ?? { message: 'ok' }, trust: TRUST }),
  };
}

const v6UserMessage = (text: string) => ({
  id: 'm-1',
  role: 'user' as const,
  parts: [{ type: 'text' as const, text }],
});

describe('POST /api/agent/v1/chat', () => {
  it('returns 401 when no session', async () => {
    const app = new Hono<{ Variables: { session: TestSession } }>();
    registerAgentRoutes(app, {
      mastra: fakeMastra,
      pool: fakePool,
      chatOrchestration: async () => fakeChatRun(),
    });
    const res = await app.request('/api/agent/v1/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [v6UserMessage('hi')] }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when session lacks agent.chat.use', async () => {
    const app = new Hono<{ Variables: { session: TestSession } }>();
    app.use('*', async (c, next) => {
      c.set('session', {
        tenant_id: 't',
        user_id: 'u',
        effective_permissions: new Set<string>(),
        role_summary: { roles: [], cross_tenant_read: false },
      });
      await next();
    });
    registerAgentRoutes(app, {
      mastra: fakeMastra,
      pool: fakePool,
      chatOrchestration: async () => fakeChatRun(),
    });
    const res = await app.request('/api/agent/v1/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [v6UserMessage('hi')] }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid body', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      const app = new Hono<{ Variables: { session: TestSession } }>();
      app.use('*', async (c, next) => {
        c.set('session', {
          tenant_id,
          user_id: admin_user_id,
          effective_permissions: new Set(['agent.chat.use']),
          role_summary: { roles: ['org.admin'], cross_tenant_read: false },
        });
        await next();
      });
      registerAgentRoutes(app, {
        mastra: fakeMastra,
        pool: fakePool,
        chatOrchestration: async () => fakeChatRun(),
      });
      const res = await app.request('/api/agent/v1/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      });
      expect(res.status).toBe(400);
    });
  });

  it('returns 404 when the supplied id belongs to another user', async () => {
    await withAgentTestDb(async ({ pool, databaseUrl }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      const { buildMastra } = await import('../../src/backend/runtime.ts');
      const mastra = buildMastra({ pool, databaseUrl });
      const storage = mastra.getStorage() as unknown as {
        init: () => Promise<void>;
        stores: {
          memory: {
            saveThread: (args: {
              thread: {
                id: string;
                resourceId: string;
                title?: string;
                createdAt: Date;
                updatedAt: Date;
                metadata?: Record<string, unknown>;
              };
            }) => Promise<unknown>;
          };
        };
      };
      await storage.init();
      const now = new Date();
      const foreignThreadId = 'foreign-thread-1';
      await storage.stores.memory.saveThread({
        thread: {
          id: foreignThreadId,
          resourceId: 'someone-else',
          title: 'not mine',
          createdAt: now,
          updatedAt: now,
          metadata: {},
        },
      });

      // The orchestration must never run — failure mode is leaking another
      // user's thread. Surface that loudly if the guard regresses.
      let orchestrationCalled = false;
      const trippedOrchestration = async (): Promise<ChatStreamRun> => {
        orchestrationCalled = true;
        return fakeChatRun();
      };

      const app = new Hono<{ Variables: { session: TestSession } }>();
      app.use('*', async (c, next) => {
        c.set('session', {
          tenant_id,
          user_id: admin_user_id,
          effective_permissions: new Set(['agent.chat.use']),
          role_summary: { roles: ['org.admin'], cross_tenant_read: false },
        });
        await next();
      });
      registerAgentRoutes(app, {
        mastra: mastra as never,
        pool,
        chatOrchestration: trippedOrchestration,
      });

      const res = await app.request('/api/agent/v1/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: foreignThreadId, messages: [v6UserMessage('hijack')] }),
      });
      expect(res.status).toBe(404);
      expect(orchestrationCalled).toBe(false);
    });
  });

  it('injects a [Context: ...] prefix into the orchestration userText and extracts taskId', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });

      let capturedInput: { userText: string; taskId: string | null } | undefined;
      const captureOrchestration = async (runInput: {
        userText: string;
        taskId: string | null;
      }): Promise<ChatStreamRun> => {
        capturedInput = runInput;
        return fakeChatRun();
      };

      const app = new Hono<{ Variables: { session: TestSession } }>();
      app.use('*', async (c, next) => {
        c.set('session', {
          tenant_id,
          user_id: admin_user_id,
          effective_permissions: new Set(['agent.chat.use']),
          role_summary: { roles: ['org.admin'], cross_tenant_read: false },
        });
        await next();
      });
      registerAgentRoutes(app, {
        mastra: fakeMastra,
        pool: fakePool,
        chatOrchestration: captureOrchestration,
      });

      const res = await app.request('/api/agent/v1/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              id: 'm1',
              role: 'user',
              parts: [
                { type: 'text', text: 'help me reorder this' },
                {
                  type: 'data-page-context',
                  id: 'p1',
                  data: {
                    kind: 'planner.task',
                    id: 'task-8f3e',
                    label: 'Q3 launch',
                    summary: 'Marketing checklist.',
                  },
                },
              ],
            },
          ],
        }),
      });
      expect(res.status).toBe(200);
      await res.text();
      expect(capturedInput?.userText).toBe(
        '[Context: planner.task#task-8f3e — "Q3 launch"\nSummary: Marketing checklist.]\n\nhelp me reorder this',
      );
      expect(capturedInput?.taskId).toBe('task-8f3e');
    });
  });
});

describe('POST /api/agent/v1/chat (orchestration runtime persistence)', () => {
  // The orchestration chat harness streams trust-trace cards + a final answer
  // but must ALSO persist the turn to Mastra memory — otherwise the AUI
  // remote-thread-list reconciles against an empty server and the conversation
  // "reloads and disappears". See routes.ts chatOrchestration branch.
  const recommendationsResult = {
    recommendations: [
      {
        userId: 'u1',
        name: 'Alice',
        skillMatch: ['stripe'],
        skillMatchCount: 1,
        status: 'busy',
      },
    ],
  };

  it('persists the user turn + assistant answer + result/trust cards so it survives reload', async () => {
    await withAgentTestDb(async ({ pool, databaseUrl }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      const { buildMastra } = await import('../../src/backend/runtime.ts');
      const mastra = buildMastra({ pool, databaseUrl });
      const storage = mastra.getStorage() as unknown as {
        init: () => Promise<void>;
        stores: {
          memory: {
            listMessages: (q: {
              threadId: string;
            }) => Promise<{ messages: Array<{ role?: string; content?: unknown }> }>;
          };
        };
      };
      await storage.init();

      const app = new Hono<{ Variables: { session: TestSession } }>();
      app.use('*', async (c, next) => {
        c.set('session', {
          tenant_id,
          user_id: admin_user_id,
          effective_permissions: new Set(['agent.chat.use', 'agent.thread.read.self']),
          role_summary: { roles: ['org.admin'], cross_tenant_read: false },
        });
        await next();
      });
      registerAgentRoutes(app, {
        mastra: mastra as never,
        pool,
        chatOrchestration: async () =>
          fakeChatRun({ text: ['Recommended: Alice.'], result: recommendationsResult }),
      });

      const threadId = 'orch-thread-1';
      const res = await app.request('/api/agent/v1/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: threadId,
          messages: [v6UserMessage('Who should take this task')],
        }),
      });
      expect(res.status).toBe(200);
      // Drive the stream to completion so the in-`execute` persistence runs.
      await res.text();

      // The thread row now exists and is listable.
      const list = await app.request('/api/agent/v1/threads');
      expect(list.status).toBe(200);
      const listed = (await list.json()) as { threads: Array<{ id: string }> };
      expect(listed.threads.some((t) => t.id === threadId)).toBe(true);

      // The persisted user turn round-trips through GET (text part intact).
      const got = await app.request(`/api/agent/v1/threads/${threadId}`);
      expect(got.status).toBe(200);
      const body = (await got.json()) as {
        messages: Array<{
          role: string;
          parts: Array<{ type: string; data?: unknown; text?: string }>;
        }>;
      };
      const user = body.messages.find((m) => m.role === 'user');
      expect(
        user?.parts.some((p) => p.type === 'text' && p.text === 'Who should take this task'),
      ).toBe(true);

      // The persisted assistant message carries the streamed prose plus the
      // reconciled data-result / data-trust cards (read straight from storage —
      // the GET projection drops the result/trust data parts on purpose).
      const stored = await storage.stores.memory.listMessages({ threadId });
      const assistant = stored.messages.find((m) => m.role === 'assistant');
      expect(assistant).toBeDefined();
      const parts = (assistant?.content as { parts?: Array<{ type: string; data?: unknown }> })
        .parts;
      const textPart = parts?.find((p) => p.type === 'text') as { text?: string } | undefined;
      expect(textPart?.text).toContain('Alice');
      const resultPart = parts?.find((p) => p.type === 'data-result');
      expect(
        (resultPart?.data as { recommendations: Array<{ name: string }> }).recommendations[0]!.name,
      ).toBe('Alice');
      expect(parts?.some((p) => p.type === 'data-trust')).toBe(true);
    });
  });

  it('passes threadId + memory handles in the orchestration ctx', async () => {
    await withAgentTestDb(async ({ pool, databaseUrl }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      const { buildMastra } = await import('../../src/backend/runtime.ts');
      const mastra = buildMastra({ pool, databaseUrl });
      await (mastra.getStorage() as unknown as { init: () => Promise<void> }).init();

      let capturedCtx: Record<string, unknown> | undefined;
      const captureOrchestration = async (
        _runInput: unknown,
        ctx: unknown,
      ): Promise<ChatStreamRun> => {
        capturedCtx = ctx as Record<string, unknown>;
        return fakeChatRun();
      };

      // Identity-checkable stand-ins: the route must wrap THESE instances in
      // { memory, memoryConfig } handles — it never calls into them here.
      const fakeEntitiesMemory = { tag: 'entities' };
      const fakeEntitiesConfig = { tag: 'entities-config' };
      const fakeUserMemory = { tag: 'user' };
      const fakeUserConfig = { tag: 'user-config' };

      const app = new Hono<{ Variables: { session: TestSession } }>();
      app.use('*', async (c, next) => {
        c.set('session', {
          tenant_id,
          user_id: admin_user_id,
          effective_permissions: new Set(['agent.chat.use', 'agent.thread.read.self']),
          role_summary: { roles: ['org.admin'], cross_tenant_read: false },
        });
        await next();
      });
      registerAgentRoutes(app, {
        mastra: mastra as never,
        pool,
        chatOrchestration: captureOrchestration,
        entitiesMemory: fakeEntitiesMemory as never,
        entitiesMemoryConfig: fakeEntitiesConfig as never,
        userMemory: fakeUserMemory as never,
        userMemoryConfig: fakeUserConfig as never,
      });

      const res = await app.request('/api/agent/v1/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'orch-mem-thread-1',
          messages: [v6UserMessage('find infrastructure tasks')],
        }),
      });
      expect(res.status).toBe(200);
      await res.text();

      expect(capturedCtx?.threadId).toBe('orch-mem-thread-1');
      expect(
        (capturedCtx?.entitiesMemory as { memory: unknown; memoryConfig: unknown }).memory,
      ).toBe(fakeEntitiesMemory);
      expect(
        (capturedCtx?.entitiesMemory as { memory: unknown; memoryConfig: unknown }).memoryConfig,
      ).toBe(fakeEntitiesConfig);
      expect((capturedCtx?.userMemory as { memory: unknown; memoryConfig: unknown }).memory).toBe(
        fakeUserMemory,
      );
      expect(
        (capturedCtx?.userMemory as { memory: unknown; memoryConfig: unknown }).memoryConfig,
      ).toBe(fakeUserConfig);
    });
  });
});

describe('GET /api/agent/v1/threads/:id (data-page-context round-trip)', () => {
  it('returns data-page-context parts verbatim from stored messages', async () => {
    await withAgentTestDb(async ({ pool, databaseUrl }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      const { buildMastra } = await import('../../src/backend/runtime.ts');
      const mastra = buildMastra({ pool, databaseUrl });
      const storage = mastra.getStorage() as unknown as {
        init: () => Promise<void>;
        stores: {
          memory: {
            saveThread: (args: {
              thread: {
                id: string;
                resourceId: string;
                title?: string;
                createdAt: Date;
                updatedAt: Date;
                metadata?: Record<string, unknown>;
              };
            }) => Promise<unknown>;
            saveMessages: (args: { messages: unknown[] }) => Promise<unknown>;
          };
        };
      };
      await storage.init();

      const threadId = 'thread-ctx-1';
      const now = new Date();
      await storage.stores.memory.saveThread({
        thread: {
          id: threadId,
          resourceId: `${tenant_id}:${admin_user_id}`,
          title: 'with context',
          createdAt: now,
          updatedAt: now,
          metadata: {},
        },
      });
      await storage.stores.memory.saveMessages({
        messages: [
          {
            id: 'msg-ctx-1',
            threadId,
            resourceId: `${tenant_id}:${admin_user_id}`,
            role: 'user',
            createdAt: now,
            content: {
              format: 2,
              parts: [
                { type: 'text', text: 'hi' },
                {
                  type: 'data-page-context',
                  id: 'p1',
                  data: { kind: 'planner.task', id: 't1', label: 'X' },
                },
              ],
            },
          },
        ],
      });

      const app = new Hono<{ Variables: { session: TestSession } }>();
      app.use('*', async (c, next) => {
        c.set('session', {
          tenant_id,
          user_id: admin_user_id,
          effective_permissions: new Set([
            'agent.chat.use',
            'agent.thread.read.self',
            'agent.thread.write.self',
          ]),
          role_summary: { roles: ['org.admin'], cross_tenant_read: false },
        });
        await next();
      });
      registerAgentRoutes(app, {
        mastra: mastra as never,
        pool,
        chatOrchestration: async () => fakeChatRun(),
      });

      const res = await app.request(`/api/agent/v1/threads/${threadId}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        messages: Array<{ parts: Array<{ type: string; data?: { id: string } }> }>;
      };
      const m = body.messages[0];
      expect(m).toBeDefined();
      const part = m?.parts.find((p) => p.type === 'data-page-context');
      expect(part).toBeDefined();
      expect(part?.data?.id).toBe('t1');
    });
  });
});

describe('GET /api/agent/v1/threads/:id (sub-agent leaf tool calls)', () => {
  it('reconstructs a data-tool-agent part from a delegate tool-invocation', async () => {
    await withAgentTestDb(async ({ pool, databaseUrl }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      const { buildMastra } = await import('../../src/backend/runtime.ts');
      const mastra = buildMastra({ pool, databaseUrl });
      const storage = mastra.getStorage() as unknown as {
        init: () => Promise<void>;
        stores: {
          memory: {
            saveThread: (args: {
              thread: {
                id: string;
                resourceId: string;
                title?: string;
                createdAt: Date;
                updatedAt: Date;
                metadata?: Record<string, unknown>;
              };
            }) => Promise<unknown>;
            saveMessages: (args: { messages: unknown[] }) => Promise<unknown>;
          };
        };
      };
      await storage.init();

      const threadId = 'thread-leaf-1';
      const now = new Date();
      await storage.stores.memory.saveThread({
        thread: {
          id: threadId,
          resourceId: `${tenant_id}:${admin_user_id}`,
          title: 'with delegate',
          createdAt: now,
          updatedAt: now,
          metadata: {},
        },
      });
      await storage.stores.memory.saveMessages({
        messages: [
          {
            id: 'msg-leaf-1',
            threadId,
            resourceId: `${tenant_id}:${admin_user_id}`,
            role: 'assistant',
            createdAt: now,
            content: {
              format: 2,
              parts: [
                {
                  type: 'tool-invocation',
                  toolInvocation: {
                    toolCallId: 'delegate-1',
                    toolName: 'agent-planner',
                    state: 'result',
                    args: { prompt: 'do it' },
                    result: {
                      text: '',
                      subAgentToolResults: [
                        { toolCallId: 'leaf-1', toolName: 'planner_createTask', result: {} },
                        { toolCallId: 'leaf-2', toolName: 'identity_whoAmI', result: {} },
                      ],
                    },
                  },
                },
                { type: 'text', text: 'done' },
              ],
            },
          },
        ],
      });

      const app = new Hono<{ Variables: { session: TestSession } }>();
      app.use('*', async (c, next) => {
        c.set('session', {
          tenant_id,
          user_id: admin_user_id,
          effective_permissions: new Set([
            'agent.chat.use',
            'agent.thread.read.self',
            'agent.thread.write.self',
          ]),
          role_summary: { roles: ['org.admin'], cross_tenant_read: false },
        });
        await next();
      });
      registerAgentRoutes(app, {
        mastra: mastra as never,
        pool,
        chatOrchestration: async () => fakeChatRun(),
      });

      const res = await app.request(`/api/agent/v1/threads/${threadId}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        messages: Array<{
          parts: Array<{
            type: string;
            data?: {
              id: string;
              toolCalls: Array<{ toolCallId: string; toolName: string }>;
              toolResults: Array<{ toolCallId: string; isError: boolean }>;
            };
          }>;
        }>;
      };
      const m = body.messages.find((msg) => msg.parts.some((p) => p.type === 'data-tool-agent'));
      expect(m).toBeDefined();
      // The delegate row itself is still present alongside the reconstructed leaf part.
      expect(m?.parts.some((p) => p.type === 'tool-agent-planner')).toBe(true);
      const leaf = m?.parts.find((p) => p.type === 'data-tool-agent');
      expect(leaf?.data?.id).toBe('planner');
      expect(leaf?.data?.toolCalls.map((c) => c.toolName)).toEqual([
        'planner_createTask',
        'identity_whoAmI',
      ]);
      expect(leaf?.data?.toolResults.every((r) => r.isError === false)).toBe(true);
    });
  });
});

describe('POST /api/agent/v1/chat (model override)', () => {
  function appWithCapture(opts: { userId: string; tenantId: string }) {
    let capturedCtx: Record<string, unknown> | undefined;
    const captureOrchestration = async (
      _runInput: unknown,
      ctx: unknown,
    ): Promise<ChatStreamRun> => {
      capturedCtx = ctx as Record<string, unknown>;
      return fakeChatRun();
    };
    const app = new Hono<{ Variables: { session: TestSession } }>();
    app.use('*', async (c, next) => {
      c.set('session', {
        tenant_id: opts.tenantId,
        user_id: opts.userId,
        effective_permissions: new Set(['agent.chat.use']),
        role_summary: { roles: ['org.admin'], cross_tenant_read: false },
      });
      await next();
    });
    registerAgentRoutes(app, {
      mastra: fakeMastra,
      pool: fakePool,
      chatOrchestration: captureOrchestration,
    });
    return { app, capturedCtx: () => capturedCtx };
  }

  it('rejects an unknown model key with 400 unknown_model', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      const { app } = appWithCapture({ userId: admin_user_id, tenantId: tenant_id });
      const res = await app.request('/api/agent/v1/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [v6UserMessage('hi')],
          model: 'openai/no-such-model-key',
        }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('unknown_model');
    });
  });

  it('passes the resolved model in ctx for an explicit pick', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      const { app, capturedCtx } = appWithCapture({
        userId: admin_user_id,
        tenantId: tenant_id,
      });
      // global-setup pins AGENT_MODEL=mock/echo, so the test catalog is that
      // single entry (AGENT_MODEL preempts the built-in fallback catalog).
      const res = await app.request('/api/agent/v1/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [v6UserMessage('hi')], model: 'mock/echo' }),
      });
      expect(res.status).toBe(200);
      await res.text();
      expect(capturedCtx()?.model).toBeDefined();
    });
  });

  it('leaves ctx.model undefined for auto and for no pick', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      for (const body of [
        { messages: [v6UserMessage('hi')], model: 'auto' },
        { messages: [v6UserMessage('hi')] },
      ]) {
        const { app, capturedCtx } = appWithCapture({
          userId: admin_user_id,
          tenantId: tenant_id,
        });
        const res = await app.request('/api/agent/v1/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        expect(res.status).toBe(200);
        await res.text();
        expect(capturedCtx()?.model).toBeUndefined();
      }
    });
  });
});
