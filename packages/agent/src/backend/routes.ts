import type { Mastra } from '@mastra/core';
import type { MemoryConfig } from '@mastra/core/memory';
import { RequestContext } from '@mastra/core/request-context';
import type { Memory } from '@mastra/memory';
import { AgentRegistry, type ChatHitlDecider } from '@seta/agent-sdk';
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from 'ai';
import type { Context, Hono } from 'hono';
import type { Pool } from 'pg';
import { z } from 'zod';
import { cancelWorkflowRun } from './domain/cancel-workflow-run.ts';
import { decideApproval } from './domain/decide-approval.ts';
import { getWorkflowRun } from './domain/get-workflow-run.ts';
import { getWorkflowRunSnapshot } from './domain/get-workflow-run-snapshot.ts';
import { listMyPendingApprovals } from './domain/list-my-pending-approvals.ts';
import { listThreadApprovals } from './domain/list-thread-approvals.ts';
import { listWorkflowRuns } from './domain/list-workflow-runs.ts';
import { makeAssignApprovalRecorder } from './domain/make-assign-approval-recorder.ts';
import { replayWorkflowFromStep } from './domain/replay-workflow-from-step.ts';
import { rerunWorkflow } from './domain/rerun-workflow.ts';
import { agentEnv } from './env.ts';
import { listModels, ModelNotFoundError, resolveModel } from './model-registry.ts';
import { ORCHESTRATION_STEP_PART, streamOrchestrationToUI } from './orchestration-chat-stream.ts';
import { RateLimitError, reserveTurn } from './rate-limit.ts';
import type { LifecycleDrainer } from './runtime.ts';
import type { SessionLike } from './types.ts';
import { issueSseToken } from './workflows/_infra/auth-token.ts';
import { getWorkflowInputSchema } from './workflows/_infra/input-schema-registry.ts';
import { onLifecycleEvent } from './workflows/_infra/lifecycle-hook.ts';
import { mountInboxSse } from './workflows/_infra/sse-inbox.ts';
import { mountRunSse } from './workflows/_infra/sse-run.ts';

// Disable proxy buffering (Vite dev http-proxy, nginx, etc.) so SSE chunks reach
// the client as they're written; without this, the entire stream is buffered and
// the assistant's reply appears all-at-once at the end.
const NO_BUFFER_HEADERS = {
  'X-Accel-Buffering': 'no',
  'Cache-Control': 'no-cache, no-transform',
} as const;

function handleDomainError(c: Context<AgentRouteEnv>, err: unknown): Response {
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
  model: z.string().optional(),
});

export type AgentRouteDeps = {
  mastra: unknown;
  drainer: LifecycleDrainer;
  pool: Pool;
  log?: {
    error: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
  };
  /**
   * Per-tool-ID handlers for chat-flow HITL decisions.
   *
   * When a chat-flow tool uses ChatHitlRecorder to create a workflow_approvals
   * row (synthetic workflow_id = '__chat_hitl:<toolId>'), the decide-approval
   * endpoint calls the matching handler here to execute the domain action
   * directly — no Mastra workflow resume is needed or possible for chat HITL.
   *
   * Keyed by toolId (e.g. 'planner_proposeAssignment'). Populated by the
   * server entry-point, which is the only layer allowed to import from both
   * packages/agent (engine) and feature modules like packages/planner.
   */
  chatHitlDeciders?: Record<string, ChatHitlDecider>;
  /**
   * Thread-scoped conversation-entities Memory + its MemoryConfig. Injected
   * into requestContext under RC_AGENT_MEMORY by the chat route so tools can do
   * server-side, per-conversation entity writes (entity recorder, task-ref
   * resolver). Keyed on the real chat thread id, not the user resource, so
   * entities never leak across conversations. Optional because tests may
   * construct routes without a configured Memory.
   */
  entitiesMemory?: Memory;
  entitiesMemoryConfig?: MemoryConfig;
  /**
   * Resource-scoped userContext Memory (the supervisor tree's GuardedMemory) +
   * its MemoryConfig. The orchestration chat branch passes both into the run
   * ctx so the orchestrator can inject userContext into its prompt and expose
   * the guarded updateWorkingMemory tool. Writes land in agent.mastra_resources.
   * Optional because tests may construct routes without a configured Memory.
   */
  userMemory?: Memory;
  userMemoryConfig?: MemoryConfig;
  /**
   * The chat runtime: every chat turn streams through this inline staffing
   * orchestration. Injected by the composition root (apps/server), the only
   * layer that can bind staffing adapters to the engine.
   */
  chatOrchestration: (
    runInput: { userText: string; taskId: string | null },
    ctx: import('@seta/shared-orchestration').RunCtx,
  ) => AsyncIterable<import('@seta/shared-orchestration').OrchestrationEvent>;
};

export type AgentRouteEnv = { Variables: { session: SessionLike } };

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

    // Disambiguation: check if a different entity was discussed in recent
    // assistant messages. If so, add a hint so the agent knows page context
    // may conflict with conversation context.
    let disambiguationHint = '';
    const pageEntityId = ctx.data.id;
    for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
      const prev = messages[j];
      if (!prev || prev.role !== 'assistant') continue;
      const prevText = (prev.parts ?? [])
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join(' ');
      // Check if a different task/entity ID was mentioned in recent assistant turns
      const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
      const mentionedIds = prevText.match(uuidPattern) ?? [];
      const differentEntityDiscussed = mentionedIds.some((id) => id !== pageEntityId);
      if (differentEntityDiscussed) {
        disambiguationHint =
          "\nNote: The user's current page shows this entity, but their recent conversation " +
          "may reference a different entity. If the user's message is ambiguous, prefer the " +
          'entity from the conversation context unless they explicitly reference "this task" ' +
          'or "the one on screen".\n';
        break;
      }
    }

    const prefix = ctx.data.summary
      ? `[Context: ${ctx.data.kind}#${ctx.data.id} — "${ctx.data.label}"\nSummary: ${ctx.data.summary}]${disambiguationHint}\n\n`
      : `[Context: ${ctx.data.kind}#${ctx.data.id} — "${ctx.data.label}"]${disambiguationHint}\n\n`;
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

function pageContextTaskId(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== 'user') continue;
    const ctx = (m.parts ?? []).find(isPageContextPart);
    // The planner task page sets page-context kind 'planner.task'; accept the
    // bare 'task' too (used by API callers / tests).
    if (ctx && (ctx.data.kind === 'task' || ctx.data.kind === 'planner.task')) return ctx.data.id;
  }
  return null;
}

export function registerAgentRoutes(app: Hono<AgentRouteEnv>, deps: AgentRouteDeps): void {
  app.post('/api/agent/v1/chat', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) {
      return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    }
    if (!session.effective_permissions.has('agent.chat.use')) {
      return c.json({ error: 'forbidden', message: 'agent.chat.use required' }, 403);
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
    const estimatedTokensIn = Math.min(2_000, Math.max(50, userText.length * 4));

    console.log('[agent.chat] ← request', {
      userId: session.user_id,
      threadId: parsed.data.id ?? '(new)',
      userText: userText.slice(0, 120),
      messageCount: messages.length,
    });

    // Per-turn model override: an explicit picker choice resolves through the
    // model registry and rides RunCtx.model into the orchestrator and every
    // sub-agent LLM call. Absent or 'auto' ⇒ no override — the runtime's
    // boot-time default (resolveModel('auto', { tierHint: 'fast' }) in
    // apps/server) applies.
    let modelOverride: ReturnType<typeof resolveModel>['model'] | undefined;
    if (parsed.data.model && parsed.data.model !== 'auto') {
      try {
        modelOverride = resolveModel(parsed.data.model, { tierHint: 'fast' }).model;
      } catch (e) {
        if (e instanceof ModelNotFoundError) {
          return c.json({ error: 'unknown_model', message: e.message }, 400);
        }
        throw e;
      }
    }

    try {
      await reserveTurn({
        tenantId: session.tenant_id,
        userId: session.user_id,
        estimatedTokens: estimatedTokensIn,
        turnLimit: agentEnv.AGENT_RATE_LIMIT_TURNS_PER_MIN,
        tpmLimit: agentEnv.AGENT_RATE_LIMIT_TPM,
      });
    } catch (e) {
      if (e instanceof RateLimitError) {
        c.header('Retry-After', String(Math.ceil(e.retryAfterSeconds)));
        return c.json({ error: 'rate_limited', message: e.message }, 429);
      }
      throw e;
    }

    const taskId = pageContextTaskId(effectiveMessages);
    const orchestrate = deps.chatOrchestration;
    const orchThreadId = parsed.data.id;
    const orchStore = getMemoryStore();
    // Original (un-prefixed) last user message — what the user actually typed,
    // persisted as-is so reload shows clean text (no injected [Context] prefix).
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    const userCreatedAt = new Date();
    // The orchestration harness has no LLM title-gen; derive a thread title
    // from the user's (un-prefixed) question so the rail shows a real label.
    const cleanUserText = (lastUserMessage?.parts ?? [])
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join(' ')
      .trim();
    const orchThreadTitle = (cleanUserText || userText).slice(0, 80) || 'New conversation';

    // In-thread HITL: lets the orchestrator record an approval card after a
    // successful recommend flow (the recommend post-step). Idempotent per
    // task — mutex with the evented assignBySkill path.
    const recordHitlApproval = makeAssignApprovalRecorder({
      tenantId: session.tenant_id,
      userId: session.user_id,
      threadId: orchThreadId ?? null,
      pool: deps.pool,
    });

    // Create the thread row up front (mirrors the workflow-start path, which
    // projects synchronously so a GET never 404s). The orchestration runtime
    // has no Mastra Agent.stream to persist for us; without a thread row the
    // AUI remote-thread-list reconciles against an empty server and evicts the
    // in-flight conversation — it "reloads and disappears" mid-stream. The
    // ownership guard: never write onto another user's thread.
    if (orchThreadId && orchStore) {
      const existing = await orchStore.getThreadById({ threadId: orchThreadId });
      if (existing && existing.resourceId !== session.user_id) {
        return c.json({ error: 'not_found', message: 'thread not found' }, 404);
      }
      if (!existing) {
        await orchStore.saveThread({
          thread: {
            id: orchThreadId,
            resourceId: session.user_id,
            title: orchThreadTitle,
            createdAt: userCreatedAt,
            updatedAt: userCreatedAt,
            metadata: {},
          },
        });
      }
    }

    const uiStream = createUIMessageStream({
      originalMessages: effectiveMessages,
      execute: async ({ writer }) => {
        const { assistantParts } = await streamOrchestrationToUI(
          writer as unknown as import('./orchestration-chat-stream.ts').UiStreamWriter,
          orchestrate(
            { userText, taskId },
            {
              tenantId: session.tenant_id,
              actorUserId: session.user_id,
              recordHitlApproval,
              // Working-memory wiring: the orchestrator sets request-context
              // keys from these so the entity recorder / task-ref resolver /
              // userContext read all key on the real chat thread + the
              // authenticated user.
              threadId: orchThreadId,
              entitiesMemory:
                deps.entitiesMemory && deps.entitiesMemoryConfig
                  ? { memory: deps.entitiesMemory, memoryConfig: deps.entitiesMemoryConfig }
                  : undefined,
              userMemory:
                deps.userMemory && deps.userMemoryConfig
                  ? { memory: deps.userMemory, memoryConfig: deps.userMemoryConfig }
                  : undefined,
              model: modelOverride,
            },
          ),
        );
        // Persist the user turn + assistant trace timeline so the conversation
        // survives reload (GET /threads/:id rebuilds the cards + final answer).
        if (!orchThreadId || !orchStore) return;
        try {
          const assistantCreatedAt = new Date(Math.max(Date.now(), userCreatedAt.getTime() + 1));
          await orchStore.saveMessages({
            messages: [
              {
                id: lastUserMessage?.id ?? crypto.randomUUID(),
                threadId: orchThreadId,
                resourceId: session.user_id,
                role: 'user',
                createdAt: userCreatedAt,
                content: {
                  format: 2,
                  parts: lastUserMessage?.parts ?? [{ type: 'text', text: userText }],
                },
              },
              {
                id: crypto.randomUUID(),
                threadId: orchThreadId,
                resourceId: session.user_id,
                role: 'assistant',
                createdAt: assistantCreatedAt,
                content: { format: 2, parts: assistantParts },
              },
            ],
          });
        } catch (err) {
          (deps.log?.error ?? console.error)(
            {
              subsystem: 'agent.chat',
              event: 'orchestration.persist.failed',
              threadId: orchThreadId,
              err,
            },
            'failed to persist orchestration chat turn',
          );
        }
      },
    });
    return createUIMessageStreamResponse({ stream: uiStream, headers: NO_BUFFER_HEADERS });
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
    saveThread(q: {
      thread: {
        id: string;
        resourceId: string;
        title?: string;
        createdAt: Date;
        updatedAt: Date;
        metadata?: Record<string, unknown>;
      };
    }): Promise<ThreadRow>;
    saveMessages(q: { messages: unknown[] }): Promise<unknown>;
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
  // Reconstructs the live `tool-agent` data part on reload so the same
  // `extractLeafToolCalls` frontend path renders a delegated sub-agent's leaf
  // tool calls. Mirrors the AI SDK v6 `data-<name>` wire convention used by
  // `data-page-context`; the frontend reads it as `{ type:'data', name:'tool-agent', data }`.
  type DataToolAgentPart = {
    type: 'data-tool-agent';
    id: string;
    data: {
      id: string;
      toolCalls: { toolCallId: string; toolName: string }[];
      toolResults: { toolCallId: string; isError: boolean }[];
    };
  };
  // Reconstructs the per-step trust-trace card the orchestration chat stream
  // emits (see orchestration-chat-stream.ts) so the timeline renders on reload.
  type DataOrchestrationStepPart = {
    type: `data-${typeof ORCHESTRATION_STEP_PART}`;
    id: string;
    data: { stepId: string; agentId?: string; status: string; trust?: unknown };
  };
  type UIMessagePart =
    | TextUIPart
    | ReasoningUIPart
    | ToolUIPart
    | DataPageContextPart
    | DataToolAgentPart
    | DataOrchestrationStepPart;
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

  // Mastra nests a delegated sub-agent's leaf tool calls inside the delegate
  // `tool-invocation` result as `subAgentToolResults: { toolCallId, toolName, result }[]`
  // (no per-call error flag — a returned result is a success). Rebuild the `tool-agent`
  // data part the live stream emits so leaf rows render on reload too.
  function leafDataPart(
    delegateToolCallId: string,
    delegateToolName: string,
    result: unknown,
  ): DataToolAgentPart | null {
    if (!result || typeof result !== 'object') return null;
    const leaves = (result as { subAgentToolResults?: unknown }).subAgentToolResults;
    if (!Array.isArray(leaves) || leaves.length === 0) return null;
    const agentSlug = delegateToolName.startsWith('agent-')
      ? delegateToolName.slice('agent-'.length)
      : delegateToolName;
    const toolCalls: { toolCallId: string; toolName: string }[] = [];
    const toolResults: { toolCallId: string; isError: boolean }[] = [];
    for (let n = 0; n < leaves.length; n++) {
      const leaf = leaves[n];
      if (!leaf || typeof leaf !== 'object') continue;
      const l = leaf as { toolCallId?: unknown; toolName?: unknown; isError?: unknown };
      const callId =
        typeof l.toolCallId === 'string' && l.toolCallId.length > 0
          ? l.toolCallId
          : `${delegateToolCallId}-leaf-${n}`;
      const name = typeof l.toolName === 'string' && l.toolName.length > 0 ? l.toolName : 'tool';
      toolCalls.push({ toolCallId: callId, toolName: name });
      toolResults.push({ toolCallId: callId, isError: l.isError === true });
    }
    if (toolCalls.length === 0) return null;
    return {
      type: 'data-tool-agent',
      id: `${delegateToolCallId}-leaves`,
      data: { id: agentSlug, toolCalls, toolResults },
    };
  }

  function mastraPartToUIPart(raw: unknown): UIMessagePart | UIMessagePart[] | null {
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
      const leaves = leafDataPart(i.toolCallId, i.toolName, i.result);
      return leaves ? [part, leaves] : part;
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
    if (type === `data-${ORCHESTRATION_STEP_PART}`) {
      const r = raw as { id?: unknown; data?: unknown };
      const d = r.data as { stepId?: unknown; agentId?: unknown; status?: unknown } | undefined;
      if (!d || typeof d.stepId !== 'string' || typeof d.status !== 'string') return null;
      const id = typeof r.id === 'string' ? r.id : d.stepId;
      return {
        type: `data-${ORCHESTRATION_STEP_PART}`,
        id,
        data: {
          stepId: d.stepId,
          ...(typeof d.agentId === 'string' ? { agentId: d.agentId } : {}),
          status: d.status,
          trust: (r.data as { trust?: unknown }).trust,
        },
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
      if (!p) continue;
      if (Array.isArray(p)) parts.push(...p);
      else parts.push(p);
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

  app.get('/api/agent/v1/threads', async (c) => {
    const check = checkPerm(c.get('session') as SessionLike | undefined, 'agent.thread.read.self');
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

  app.get('/api/agent/v1/threads/:id', async (c) => {
    const check = checkPerm(c.get('session') as SessionLike | undefined, 'agent.thread.read.self');
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

  app.patch('/api/agent/v1/threads/:id', async (c) => {
    const check = checkPerm(c.get('session') as SessionLike | undefined, 'agent.thread.write.self');
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

  app.delete('/api/agent/v1/threads/:id', async (c) => {
    const check = checkPerm(c.get('session') as SessionLike | undefined, 'agent.thread.write.self');
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    const storage = getMemoryStore();
    const thread = storage ? await storage.getThreadById({ threadId: c.req.param('id') }) : null;
    if (!thread || thread.resourceId !== check.session.user_id) {
      return c.json({ error: 'not_found', message: 'thread not found' }, 404);
    }
    if (storage) await storage.deleteThread({ threadId: thread.id });
    return c.json({ ok: true });
  });

  app.get('/api/agent/v1/tools', async (c) => {
    const check = checkPerm(c.get('session') as SessionLike | undefined, 'agent.chat.use');
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    const snap = AgentRegistry.snapshot();
    const seen = new Set<string>();
    const tools: Array<{ id: string; name: string; description: string }> = [];
    for (const s of snap.specialists) {
      for (const [id, tool] of Object.entries(s.tools)) {
        if (seen.has(id)) continue;
        seen.add(id);
        const meta = tool as { description?: string; displayName?: string };
        tools.push({
          id,
          name: meta.displayName ?? id,
          description: meta.description ?? '',
        });
      }
    }
    return c.json({ tools });
  });

  app.get('/api/agent/v1/agents', async (c) => {
    const check = checkPerm(c.get('session') as SessionLike | undefined, 'agent.chat.use');
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    const snap = AgentRegistry.snapshot();
    // Include domain names (used by top supervisor) AND specialist IDs (used by
    // domain supervisors when called directly). Both appear as `agent-<name>`
    // tool calls in the stream and need a renderer registered on the client.
    const seen = new Set<string>();
    const agents: Array<{ name: string; label: string }> = [];
    for (const d of snap.domains) {
      if (!seen.has(d)) {
        seen.add(d);
        agents.push({ name: d, label: d.charAt(0).toUpperCase() + d.slice(1) });
      }
    }
    for (const s of snap.specialists) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        agents.push({ name: s.id, label: s.id.charAt(0).toUpperCase() + s.id.slice(1) });
      }
    }
    return c.json({ agents });
  });

  app.get('/api/agent/v1/models', async (c) => {
    const check = checkPerm(c.get('session') as SessionLike | undefined, 'agent.chat.use');
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

  app.get('/api/agent/v1/health', async (c) => {
    const modelConfigured = listModels().models.length > 0;
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

  mountInboxSse(app as unknown as Hono, { pool: deps.pool });
  mountRunSse(app as unknown as Hono, { pool: deps.pool, mastra: deps.mastra as Mastra });

  app.get('/api/agent/v1/workflows/runs', async (c) => {
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

  app.get('/api/agent/v1/workflows/runs/:runId', async (c) => {
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

  app.get('/api/agent/v1/workflows/runs/:runId/snapshot', async (c) => {
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

  app.get('/api/agent/v1/workflows/my-pending-approvals', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    return c.json(await listMyPendingApprovals({ session }));
  });

  // All approvals (pending + decided) of one chat thread, addressed to the
  // caller. The chat UI renders decided rows persistently from this — see
  // listThreadApprovals for why deciding must not start a new agent turn.
  app.get('/api/agent/v1/workflows/threads/:threadId/approvals', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    return c.json(await listThreadApprovals({ session, threadId: c.req.param('threadId') }));
  });

  app.post('/api/agent/v1/workflows/approvals/:approvalId/decide', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    let body: {
      decision: 'approve' | 'reject' | 'modify';
      overrideUserIds?: string[];
      alternateIndex?: number;
      alternateIndices?: number[];
      note?: string;
    };
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
    if (body.overrideUserIds !== undefined) {
      if (
        !Array.isArray(body.overrideUserIds) ||
        body.overrideUserIds.some((id) => typeof id !== 'string')
      ) {
        return c.json({ error: 'invalid_body', message: 'overrideUserIds must be string[]' }, 400);
      }
    }
    if (body.alternateIndex !== undefined) {
      if (typeof body.alternateIndex !== 'number' || body.alternateIndex < 0) {
        return c.json(
          { error: 'invalid_body', message: 'alternateIndex must be a non-negative number' },
          400,
        );
      }
    }
    if (body.alternateIndices !== undefined) {
      if (
        !Array.isArray(body.alternateIndices) ||
        body.alternateIndices.some((i) => typeof i !== 'number' || i < 0)
      ) {
        return c.json(
          { error: 'invalid_body', message: 'alternateIndices must be non-negative number[]' },
          400,
        );
      }
    }
    try {
      const result = await decideApproval({
        session,
        approvalId: c.req.param('approvalId'),
        decision: body.decision,
        overrideUserIds: body.overrideUserIds,
        alternateIndex: body.alternateIndex,
        alternateIndices: body.alternateIndices,
        note: body.note,
        mastra: deps.mastra as Mastra,
        chatHitlDeciders: deps.chatHitlDeciders,
        log: deps.log,
      });
      return c.json(result);
    } catch (err) {
      return handleDomainError(c, err);
    }
  });

  app.post('/api/agent/v1/workflows/runs/:runId/rerun', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    const raw = (await c.req.json().catch(() => ({}))) as {
      inputOverride?: Record<string, unknown>;
    };
    const requestContext = new RequestContext();
    requestContext.set('actor', { type: 'user' as const, user_id: session.user_id });
    requestContext.set('tenant_id', session.tenant_id);
    requestContext.set('role_summary', session.role_summary);
    try {
      const result = await rerunWorkflow({
        session,
        runId: c.req.param('runId'),
        inputOverride: raw.inputOverride,
        mastra: deps.mastra as Mastra,
        requestContext,
        pool: deps.pool,
      });
      // Drain pending lifecycle handler Promises before responding so the
      // run-started DB projection is committed before the client navigates.
      await deps.drainer.drain();
      return c.json(result);
    } catch (err) {
      return handleDomainError(c, err);
    }
  });

  app.post('/api/agent/v1/workflows/runs/:runId/replay-from-step', async (c) => {
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
      // Drain pending lifecycle handler Promises before responding.
      // EventEmitterPubSub fires async handlers via emitter.emit() which does
      // not await their Promises — the DB projection update (workflow.suspend
      // → SET status = 'paused', approval row insert) is still in-flight when
      // timeTravel() returns. Draining here ensures the client sees a
      // consistent snapshot on its first refetch after replay.
      await deps.drainer.drain();
      return c.json(result);
    } catch (err) {
      return handleDomainError(c, err);
    }
  });

  app.post('/api/agent/v1/workflows/runs/:runId/cancel', async (c) => {
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

  app.post('/api/agent/v1/workflows/runs/:workflowId/start', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    const workflowId = c.req.param('workflowId');
    const workflow = (deps.mastra as Mastra).getWorkflow(workflowId);
    if (!workflow) {
      return c.json({ error: 'not_found', message: `unknown workflow id: ${workflowId}` }, 404);
    }
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    console.log('[workflow.start] ← request', {
      workflowId,
      userId: session.user_id,
      inputKeys: Object.keys(body ?? {}),
    });
    if (body && typeof body === 'object' && Object.hasOwn(body, 'session')) {
      return c.json(
        {
          error: 'invalid_input',
          message:
            "request body must not contain a 'session' field — session derives from the authenticated request",
        },
        400,
      );
    }
    const requestContext = new RequestContext();
    requestContext.set('actor', { type: 'user' as const, user_id: session.user_id });
    requestContext.set('tenant_id', session.tenant_id);
    requestContext.set('role_summary', session.role_summary);
    try {
      // Resolve Mastra's intrinsic workflow id (e.g. `planner.assignBySkill`)
      // up front — both the dedupe lookup (registry is keyed by mastra id) and
      // the lifecycle projection downstream use it.
      const projectedWorkflowId =
        typeof (workflow as { id?: unknown }).id === 'string'
          ? (workflow as { id: string }).id
          : workflowId;

      // Domain-scoped idempotency. A workflow can declare a dedupeKey in its
      // spec (e.g. planner.assignBySkill keys on taskId per spec §5.8). When
      // an in-flight run already exists for the same key, return that runId
      // instead of starting a duplicate. This prevents UI races and parallel-
      // tab duplication, and keeps the at-most-one-pending invariant that the
      // chat-flow mutex also enforces.
      const spec = AgentRegistry.findWorkflowSpecByMastraId(projectedWorkflowId);
      if (spec?.dedupeKey) {
        const existingRunId = await spec.dedupeKey(body, {
          tenant_id: session.tenant_id,
          user_id: session.user_id,
          role_summary: session.role_summary,
        });
        if (existingRunId) {
          console.log('[workflow.start] → dedupe hit, reusing run', {
            runId: existingRunId,
            workflowId: projectedWorkflowId,
            userId: session.user_id,
          });
          return c.json({ runId: existingRunId });
        }
      }

      const run = await workflow.createRun();
      // Project the row synchronously so a GET on the returned runId never 404s,
      // even if the user opens the deep link before Mastra's async workflow.start
      // pubsub event reaches the lifecycle hook. The async path's INSERT is then
      // a no-op via ON CONFLICT (run_id) DO NOTHING + workflow_run_events_seen.
      await onLifecycleEvent(deps.pool, {
        kind: 'run-started',
        runId: run.runId,
        eventSeq: -1,
        workflowId: projectedWorkflowId,
        tenantId: session.tenant_id,
        startedBy: session.user_id,
        startedVia: 'event',
        parentThreadId: null,
        parentRunId: null,
        sourceEventId: null,
        inputSummary: body,
        occurredAt: new Date(),
      });
      const startedAt = Date.now();
      // Surface workflow-start failures: bare `void run.start(...)` would swallow
      // the rejection, leaving the projected row stuck in `running` forever and
      // the UI showing "No graph data yet" with no error. Project a run-failed
      // event so the row gets `failed` + `error_summary`.
      void run.start({ inputData: body, requestContext } as never).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        const rawCode = (err as { code?: unknown } | null)?.code;
        const code = typeof rawCode === 'string' ? rawCode : 'workflow_start_failed';
        if (deps.log) {
          deps.log.error(
            {
              subsystem: 'agent.workflow.start',
              runId: run.runId,
              workflowId: projectedWorkflowId,
              tenantId: session.tenant_id,
              err,
            },
            'workflow start failed',
          );
        } else {
          console.error('[agent.workflow.start]', {
            runId: run.runId,
            workflowId: projectedWorkflowId,
            err,
          });
        }
        void onLifecycleEvent(deps.pool, {
          kind: 'run-failed',
          runId: run.runId,
          eventSeq: -2,
          workflowId: projectedWorkflowId,
          tenantId: session.tenant_id,
          occurredAt: new Date(),
          durationMs: Date.now() - startedAt,
          error: { code, message },
        }).catch((projErr) => {
          if (deps.log) {
            deps.log.error(
              { subsystem: 'agent.workflow.start', runId: run.runId, err: projErr },
              'failed to project run-failed event',
            );
          } else {
            console.error('[agent.workflow.start.project-fail]', projErr);
          }
        });
      });
      console.log('[workflow.start] → run created', {
        runId: run.runId,
        workflowId: projectedWorkflowId,
        userId: session.user_id,
      });
      return c.json({ runId: run.runId });
    } catch (err) {
      return handleDomainError(c, err);
    }
  });

  app.get('/api/agent/v1/workflows/definitions', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    const defs = AgentRegistry.snapshot().workflows.map((w) => {
      // Use Mastra's intrinsic workflow id (e.g. 'planner.assignBySkill') as the
      // definition id so it matches the workflow_id stored in workflow_runs.
      const mastraId =
        typeof (w.workflow as { id?: unknown }).id === 'string'
          ? (w.workflow as { id: string }).id
          : w.id;
      return {
        id: mastraId,
        domain: w.domain,
        description: w.description,
        hitlSteps: w.hitlSteps ?? [],
      };
    });
    return c.json({ rows: defs });
  });

  app.get('/api/agent/v1/workflows/:workflowId/input-schema', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    const schema = getWorkflowInputSchema(c.req.param('workflowId'));
    if (!schema) {
      return c.json({ error: 'not_found', message: 'unknown workflow id' }, 404);
    }
    return c.json(schema);
  });

  app.get('/api/agent/v1/workflows/sse-token', async (c) => {
    const session = c.get('session') as SessionLike | undefined;
    if (!session) return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    return c.json({
      token: issueSseToken({ userId: session.user_id, tenantId: session.tenant_id }),
    });
  });
}
