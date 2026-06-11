import type { MemoryConfig } from '@mastra/core/memory';
import type { Memory } from '@mastra/memory';
import type { Context } from 'hono';
import type { Pool } from 'pg';
import type { LifecycleDrainer } from '../runtime.ts';
import type { SessionLike } from '../types.ts';

// Disable proxy buffering so SSE chunks reach the client as they're written.
export const NO_BUFFER_HEADERS = {
  'X-Accel-Buffering': 'no',
  'Cache-Control': 'no-cache, no-transform',
} as const;

export type AgentRouteDeps = {
  mastra: unknown;
  drainer: LifecycleDrainer;
  pool: Pool;
  log?: {
    error: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
  };
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
  ) => Promise<import('@seta/shared-orchestration').ChatStreamRun>;
  /**
   * Resumes a suspended native-suspend agentic chat-HITL run. Injected by the
   * composition root (apps/server) as the staffing runtime's `runResume`. The
   * structural type avoids an `agent → staffing` import (depcruise-forbidden);
   * staffing's concrete `runResume` is structurally assignable.
   */
  resumeOrchestration?: (
    resume: {
      decision: 'approve' | 'reject' | 'modify';
      overrideUserIds?: string[];
      alternateIndices?: number[];
      note?: string;
    },
    ctx: import('@seta/shared-orchestration').RunCtx & {
      mastraRunId: string;
      toolCallId?: string;
    },
  ) => Promise<import('@seta/shared-orchestration').ChatStreamRun>;
  /** Injected by apps/server from @seta/knowledge (the agent package may not
   *  import feature modules). Reads + parses the thread's pending attachments,
   *  enforcing the context budget. Returns a discriminated result. */
  consumeThreadAttachments?: (input: {
    tenantId: string;
    threadId: string;
    query: string;
  }) => Promise<
    | { kind: 'ok'; contextBlock: string; consumedFileIds: string[]; failedFileIds: string[] }
    | { kind: 'overflow'; requiredTokens: number; budgetTokens: number }
    | { kind: 'error'; message: string }
  >;
  /** Marks files consumed after a successful turn. */
  markAttachmentsConsumed?: (fileIds: string[]) => Promise<void>;
  /** Marks files failed (unreadable) so they drop out of the pending list. */
  markAttachmentsFailed?: (fileIds: string[]) => Promise<void>;
};

export type AgentRouteEnv = { Variables: { session: SessionLike } };

// ---------------------------------------------------------------------------
// Memory storage types
// ---------------------------------------------------------------------------

export type ThreadRow = {
  id: string;
  resourceId: string;
  title?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  metadata?: Record<string, unknown>;
};

export type ListThreadsArgs = { filter?: { resourceId?: string }; perPage?: number | false };

export type MastraStoredMessage = {
  id?: string;
  role?: string;
  content?: unknown;
  createdAt?: Date | string;
};

export type MemoryStore = {
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

// ---------------------------------------------------------------------------
// UI message part types (persisted and rehydrated on thread reload)
// ---------------------------------------------------------------------------

export type TextUIPart = { type: 'text'; text: string };
export type ReasoningUIPart = { type: 'reasoning'; text: string };
export type ToolUIPart = {
  type: `tool-${string}`;
  toolCallId: string;
  state: 'output-available' | 'output-error' | 'input-available';
  input: unknown;
  output?: unknown;
  errorText?: string;
};
export type DataPageContextPart = {
  type: 'data-page-context';
  id: string;
  data: { kind: string; id: string; label: string; summary?: string };
};
// Reconstructs the live `tool-agent` data part on reload so the same
// `extractLeafToolCalls` frontend path renders a delegated sub-agent's leaf
// tool calls. Mirrors the AI SDK v6 `data-<name>` wire convention.
export type DataToolAgentPart = {
  type: 'data-tool-agent';
  id: string;
  data: {
    id: string;
    toolCalls: { toolCallId: string; toolName: string }[];
    toolResults: { toolCallId: string; isError: boolean }[];
  };
};
// Reconstructs the structured-result + trust cards the native chat stream
// persists, so they survive a thread reload.
export type DataResultPart = { type: 'data-result'; id: 'result'; data: unknown };
export type DataTrustPart = { type: 'data-trust'; id: 'trust'; data: unknown };
export type UIMessagePart =
  | TextUIPart
  | ReasoningUIPart
  | ToolUIPart
  | DataPageContextPart
  | DataToolAgentPart
  | DataResultPart
  | DataTrustPart;
export type UIMessageLike = { id: string; role: 'user' | 'assistant'; parts: UIMessagePart[] };

// Mastra stores tool calls as `{ type:'tool-invocation', toolInvocation }`;
// ai@6 wants `{ type:'tool-<name>', state, input, output }`.
export type MastraToolInvocation = {
  toolCallId?: unknown;
  toolName?: unknown;
  state?: unknown;
  args?: unknown;
  result?: unknown;
  errorText?: unknown;
};

// ---------------------------------------------------------------------------
// Auth/perm helpers
// ---------------------------------------------------------------------------

export type PermDenied = { status: 401 | 403; body: { error: string; message: string } };

export const checkPerm = (
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

export function handleDomainError(c: Context<AgentRouteEnv>, err: unknown): Response {
  if (err && typeof err === 'object' && 'code' in err) {
    const typed = err as { code: string; message?: string };
    const code = typed.code;
    const message = typed.message ?? code;
    if (code === 'forbidden') return c.json({ error: 'forbidden', message }, 403);
    if (code === 'not_found') return c.json({ error: 'not_found', message }, 404);
    if (code === 'already_decided') return c.json({ error: 'already_decided', message }, 409);
    if (code === 'not_resumable') return c.json({ error: 'not_resumable', message }, 409);
    if (code === 'invalid_cursor') return c.json({ error: 'invalid_cursor', message }, 400);
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Memory store accessor (takes mastra as a param to avoid closure coupling)
// ---------------------------------------------------------------------------

export function getMemoryStore(mastra: unknown): MemoryStore | null {
  const m = mastra as {
    getStorage?: () => { stores?: { memory?: MemoryStore } } | null;
  } | null;
  const storage = m?.getStorage ? m.getStorage() : null;
  return storage?.stores?.memory ?? null;
}

// ---------------------------------------------------------------------------
// Message-part converters (used in thread GET and persisted replay)
// ---------------------------------------------------------------------------

export function leafDataPart(
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

export function mastraPartToUIPart(raw: unknown): UIMessagePart | UIMessagePart[] | null {
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
  if (type === 'data-result' || type === 'data-trust') {
    const r = raw as { data?: unknown };
    if (r.data === undefined) return null;
    return type === 'data-result'
      ? { type: 'data-result', id: 'result', data: r.data }
      : { type: 'data-trust', id: 'trust', data: r.data };
  }
  return null;
}

export function toUIMessage(m: MastraStoredMessage, idx: number): UIMessageLike | null {
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
