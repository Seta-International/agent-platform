import { toAISdkStream } from '@mastra/ai-sdk';
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from 'ai';
import type { Hono } from 'hono';
import { z } from 'zod';
import {
  PendingAssignmentExistsError,
  writeChatApprovalRow,
} from '../domain/write-chat-approval-row.ts';
import { agentEnv } from '../env.ts';
import { ModelNotFoundError, resolveModel } from '../model-registry.ts';
import { type ApprovalEvent, pumpOrchestrationStream } from '../orchestration-ui-stream.ts';
import { RateLimitError, reserveTurn } from '../rate-limit.ts';
import { getTenantSettings } from '../tenant-settings.ts';
import { generateThreadTitle } from '../thread-title.ts';
import {
  type AgentRouteDeps,
  type AgentRouteEnv,
  getMemoryStore,
  NO_BUFFER_HEADERS,
} from './_shared.ts';

const ChatBody = z.object({
  id: z.string().optional(),
  messages: z.array(z.unknown()).min(1),
  trigger: z.enum(['submit-message', 'regenerate-message']).optional(),
  model: z.string().optional(),
});

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

export function mountChatRoute(app: Hono<AgentRouteEnv>, deps: AgentRouteDeps): void {
  app.post('/api/agent/v1/chat', async (c) => {
    const session = c.get('session') as import('../types.ts').SessionLike | undefined;
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
    const orchStore = getMemoryStore(deps.mastra);
    // Original (un-prefixed) last user message — what the user actually typed,
    // persisted as-is so reload shows clean text (no injected [Context] prefix).
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    const userCreatedAt = new Date();
    const cleanUserText = (lastUserMessage?.parts ?? [])
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join(' ')
      .trim();
    const orchThreadTitle = (cleanUserText || userText).slice(0, 80) || 'New conversation';

    const tenantSettings = await getTenantSettings(session.tenant_id);
    // Native-suspend HITL: when the orchestration run suspends, project the
    // approval read-model row so the pending-approvals poll renders the card.
    const onApproval = async (ev: ApprovalEvent): Promise<void> => {
      try {
        await writeChatApprovalRow({
          card: ev.card,
          mastraRunId: ev.mastraRunId,
          toolCallId: ev.toolCallId,
          threadId: orchThreadId ?? null,
          tenantId: session.tenant_id,
          userId: session.user_id,
          pool: deps.pool,
          approvalTtlHours: tenantSettings.approvalTtlHours,
        });
      } catch (err) {
        if (err instanceof PendingAssignmentExistsError) {
          // Expected race: an evented assignBySkill run is in flight for this
          // task but hasn't reached its suspend step yet. The existing proposal
          // stands — no competing card needed. Fail open; don't break the turn.
          return;
        }
        // Read-model write failure must not abort the chat turn.
        (deps.log?.error ?? console.error)(
          {
            subsystem: 'agent.chat',
            event: 'onApproval.write.failed',
            threadId: orchThreadId,
            err,
          },
          'failed to write chat approval row — continuing turn',
        );
      }
    };

    // Create the thread row up front so a GET on the returned threadId never 404s
    // mid-stream. The ownership guard: never write onto another user's thread.
    let createdNewThread = false;
    if (orchThreadId && orchStore) {
      const existing = await orchStore.getThreadById({ threadId: orchThreadId });
      if (existing && existing.resourceId !== `${session.tenant_id}:${session.user_id}`) {
        return c.json({ error: 'not_found', message: 'thread not found' }, 404);
      }
      if (!existing) {
        createdNewThread = true;
        await orchStore.saveThread({
          thread: {
            id: orchThreadId,
            resourceId: `${session.tenant_id}:${session.user_id}`,
            // With memory attached we run the orchestrator readOnly (no Mastra
            // auto-persist over our curated trace) — which also disables
            // Mastra's generateTitle. So we seed an empty title here and fill
            // it ourselves via generateThreadTitle after the turn persists.
            title: deps.userMemory ? '' : orchThreadTitle,
            createdAt: userCreatedAt,
            updatedAt: userCreatedAt,
            metadata: {},
          },
        });
      }
    }

    let effectiveUserText = userText;
    let consumedFileIds: string[] = [];
    let contextParts: Array<{ type: 'text'; text: string }> = [];
    if (orchThreadId && deps.consumeThreadAttachments) {
      const r = await deps.consumeThreadAttachments({
        tenantId: session.tenant_id,
        threadId: orchThreadId,
        query: userText,
      });
      if (r.kind === 'overflow') {
        return c.json(
          {
            error: 'context_overflow',
            message: `Attached file(s) need ~${r.requiredTokens} tokens but only ${r.budgetTokens} fit the model context. Remove a file or use a smaller one.`,
          },
          413,
        );
      }
      if (r.kind === 'error') {
        return c.json({ error: 'attachment_error', message: r.message }, 400);
      }
      // Mark unreadable files 'failed' right away so a broken file never
      // re-poisons later turns even if this turn errors downstream.
      if (r.failedFileIds.length > 0 && deps.markAttachmentsFailed) {
        await deps.markAttachmentsFailed(r.failedFileIds);
      }
      if (r.contextBlock) {
        effectiveUserText = `${r.contextBlock}\n\n${userText}`;
        consumedFileIds = r.consumedFileIds;
        // Persisted as a TEXT part so Mastra lastMessages/semanticRecall replay
        // it on follow-ups; the web renderer collapses the `<<<FILE:` sentinel
        // into a chip.
        contextParts = [{ type: 'text', text: r.contextBlock }];
      }
    }

    const uiStream = createUIMessageStream({
      originalMessages: effectiveMessages,
      execute: async ({ writer }) => {
        const run = await orchestrate(
          { userText: effectiveUserText, taskId },
          {
            tenantId: session.tenant_id,
            actorUserId: session.user_id,
            effectivePermissions: session.effective_permissions,
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
        );
        const aiParts = toAISdkStream(run.output, {
          from: 'agent',
          version: 'v6',
          sendReasoning: true,
          sendStart: true,
          sendFinish: true,
          onError: (e: unknown) => String(e),
        });
        const { assistantParts } = await pumpOrchestrationStream(
          writer as unknown as import('../orchestration-ui-stream.ts').UiStreamWriter,
          aiParts as AsyncIterable<{ type: string; delta?: string; data?: unknown }>,
          { finalize: run.finalize, onApproval },
        );
        // Persist the user turn + assistant trace timeline so the conversation
        // survives reload (GET /threads/:id rebuilds the cards + final answer).
        if (!orchThreadId || !orchStore) return;
        try {
          const assistantCreatedAt = new Date(Math.max(Date.now(), userCreatedAt.getTime() + 1));
          const userMsg = {
            id: lastUserMessage?.id ?? crypto.randomUUID(),
            threadId: orchThreadId,
            resourceId: `${session.tenant_id}:${session.user_id}`,
            role: 'user' as const,
            createdAt: userCreatedAt,
            content: {
              format: 2 as const,
              parts: [
                ...(lastUserMessage?.parts ?? [{ type: 'text', text: userText }]),
                ...contextParts,
              ],
            },
          };
          const assistantMsg = {
            id: crypto.randomUUID(),
            threadId: orchThreadId,
            resourceId: `${session.tenant_id}:${session.user_id}`,
            role: 'assistant' as const,
            createdAt: assistantCreatedAt,
            content: { format: 2 as const, parts: assistantParts },
          };
          // Persist via the Memory when present: it embeds + upserts the
          // semanticRecall vectors so future turns can recall this exchange.
          if (deps.userMemory) {
            await deps.userMemory.saveMessages({
              messages: [userMsg, assistantMsg] as never,
              memoryConfig: deps.userMemoryConfig as never,
            });
          } else {
            await orchStore.saveMessages({ messages: [userMsg, assistantMsg] });
          }
          if (consumedFileIds.length > 0 && deps.markAttachmentsConsumed) {
            await deps.markAttachmentsConsumed(consumedFileIds);
          }
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
        // Supervisor-parity auto-title: on the first turn of a memory-backed
        // thread (seeded with an empty title above), generate an LLM title from
        // the user's message and write it back.
        if (createdNewThread && deps.userMemory && orchStore) {
          try {
            const title = await generateThreadTitle({
              userText: cleanUserText || userText,
              model: modelOverride ?? resolveModel('auto', { tierHint: 'fast' }).model,
              fallback: orchThreadTitle,
            });
            await orchStore.updateThread({ id: orchThreadId, title, metadata: {} });
          } catch (err) {
            (deps.log?.error ?? console.error)(
              {
                subsystem: 'agent.chat',
                event: 'orchestration.title.failed',
                threadId: orchThreadId,
                err,
              },
              'failed to generate orchestration thread title',
            );
          }
        }
      },
    });
    return createUIMessageStreamResponse({ stream: uiStream, headers: NO_BUFFER_HEADERS });
  });
}
