import { MessagePrimitive, ThreadPrimitive, useAui, useAuiState } from '@assistant-ui/react';
import {
  Button,
  type ChatDensity,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatMessageMetadata,
  Markdown,
  Timestamp,
  Token,
} from '@seta/shared-ui';
import { Paperclip, Sparkles } from 'lucide-react';
import { type ReactNode, useCallback } from 'react';
import { ThreadListRefresher } from '../components/thread-list-refresher';
import { ToolUIRegistry } from '../components/tool-renderers';
import { ToolFallback } from '../components/tool-renderers/tool-fallback';
import { AGENT_COPY } from '../i18n';
import { parseContextAttachment } from '../lib/context-attachment';
import { ChatEmbeddedHitl } from '../workflows/components/chat-embedded-hitl';
import { AgentComposer } from './agent-composer';
import { type PageContext, useAgentSelection, usePageContext } from './agent-provider';
import { ChainOfThought } from './chain-of-thought';
import { groupByThought } from './group-by-thought';
import { RenderContextBadge } from './render-context-badge';
import { type Density, useDensity } from './use-density';

const ASSISTANT_LABEL = 'Agent';

// Our density axis is about how much *detail* the transcript shows; Astryx's is
// about spacing. 'detailed' maps to 'balanced' rather than 'spacious' so the
// side panel keeps its current information density.
const CHAT_DENSITY: Record<Density, ChatDensity> = {
  concise: 'compact',
  detailed: 'balanced',
};

function splitThinkSegments(text: string): { text: string; isThink: boolean; id: string }[] {
  const segments: { text: string; isThink: boolean; id: string }[] = [];
  let last = 0;
  for (const match of text.matchAll(/<think>([\s\S]*?)<\/think>/g)) {
    const idx = match.index ?? 0;
    const before = text.slice(last, idx).trim();
    if (before) segments.push({ text: before, isThink: false, id: `t-${last}` });
    const think = (match[1] ?? '').trim();
    if (think) segments.push({ text: think, isThink: true, id: `r-${idx}` });
    last = idx + (match[0] ?? '').length;
  }
  const after = text.slice(last).trim();
  if (after) segments.push({ text: after, isThink: false, id: `t-${last}` });
  return segments;
}

interface PartProps {
  text: string;
  status: { type: string };
}

function TextPart({ text, status }: PartProps) {
  // While the assistant is still queueing the first token, the part exists with
  // empty text; rendering anything here would stack a stray cursor above the
  // ThinkingIndicator that the transcript shows for empty turns.
  if (text.length === 0) return null;
  return (
    <ChatMessageBubble variant="ghost">
      <div className="relative">
        {/* `autolink`: the deleted ChatMarkdown ran remark-gfm, whose
            autolink-literal extension is on by default. Astryx's is opt-in, so
            without this a bare URL in an answer renders as dead plain text. */}
        <Markdown density="compact" autolink="gfm">
          {text}
        </Markdown>
        {status.type === 'running' && (
          <span
            aria-hidden
            className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-[2px] animate-pulse bg-primary"
          />
        )}
      </div>
    </ChatMessageBubble>
  );
}

function ReasoningPart({ text, status }: PartProps) {
  const running = status.type === 'running';
  if (text.length === 0 && !running) return null;
  return (
    <div
      aria-live="polite"
      className="my-1 flex gap-2 border-l-2 border-border pl-3 text-caption text-secondary"
    >
      {running && (
        <span
          aria-hidden
          className="mt-1 inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-accent-bg/70"
        />
      )}
      <span className="whitespace-pre-wrap italic leading-relaxed">{text}</span>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 text-caption text-secondary">
      <span aria-hidden className="inline-flex items-center gap-0.5">
        <span className="size-1.5 animate-bounce rounded-full bg-accent-bg/70 [animation-delay:-0.32s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-accent-bg/70 [animation-delay:-0.16s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-accent-bg/70" />
      </span>
      <span className="italic">Thinking…</span>
    </div>
  );
}

function PlainTextPart({ text }: PartProps) {
  // A persisted attachment rides as a `Context:` text part (so Mastra replays it
  // on follow-ups); collapse the `<<<FILE:` sentinel into file chips so the user
  // never sees the raw document text.
  const filenames = parseContextAttachment(text);
  if (filenames) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {filenames.map((name) => (
          <Token key={name} size="sm" label={name} icon={<Paperclip aria-hidden />} />
        ))}
      </div>
    );
  }
  return <span className="whitespace-pre-wrap">{text}</span>;
}

function AgentEmpty({ title, body }: { title: string; body: string }) {
  const aui = useAui();
  const send = (text: string) => {
    aui.composer().setText(text);
    aui.composer().send();
  };
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-12 text-center">
      <span
        aria-hidden
        className="inline-flex size-9 items-center justify-center rounded-full bg-accent-muted text-accent"
      >
        <Sparkles className="size-4" />
      </span>
      <div className="max-w-xs">
        <h3 className="text-card-title font-semibold text-primary">{title}</h3>
        <p className="mt-1.5 text-body-sm leading-[1.5] text-secondary">{body}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {AGENT_COPY.emptySuggestions.map((s) => (
          <Button
            key={s}
            type="button"
            variant="secondary"
            size="sm"
            label={s}
            onClick={() => send(s)}
          />
        ))}
      </div>
    </div>
  );
}

function extractPageContext(content: ReadonlyArray<unknown>): PageContext | undefined {
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    const p = part as { type?: unknown; name?: unknown; data?: unknown };
    if (p.type !== 'data' || p.name !== 'page-context') continue;
    const d = p.data as
      | { kind?: unknown; id?: unknown; label?: unknown; summary?: unknown }
      | undefined;
    if (
      !d ||
      typeof d.kind !== 'string' ||
      typeof d.id !== 'string' ||
      typeof d.label !== 'string'
    ) {
      continue;
    }
    return {
      kind: d.kind,
      id: d.id,
      label: d.label,
      ...(typeof d.summary === 'string' ? { summary: d.summary } : {}),
    };
  }
  return undefined;
}

function UserMessage() {
  const content = useAuiState((s) => s.message.content);
  const ctx = extractPageContext(content);
  return (
    <ChatMessage sender="user">
      <ChatMessageBubble>
        {ctx && <RenderContextBadge data={ctx} />}
        <MessagePrimitive.Parts components={{ Text: PlainTextPart }} />
      </ChatMessageBubble>
    </ChatMessage>
  );
}

function makeAssistantMessage(authorLabel: string) {
  const renderPart = ({
    part,
    children,
  }: {
    part: {
      type: string;
      status?: { type: string };
      indices?: readonly number[];
      toolUI?: ReactNode;
      dataRendererUI?: ReactNode;
      text?: string;
      toolName?: string;
      args?: unknown;
      result?: unknown;
      isError?: boolean;
    };
    children: ReactNode;
  }) => {
    switch (part.type) {
      case 'group-thought': {
        const running = part.status?.type === 'running';
        const indices = part.indices ?? [];
        return (
          <ChainOfThought running={running} count={indices.length} indices={indices}>
            {children}
          </ChainOfThought>
        );
      }
      case 'text': {
        const raw = part.text ?? '';
        const status = part.status ?? { type: 'complete' };
        if (!raw.includes('<think>')) return <TextPart text={raw} status={status} />;
        // r1-style models embed thinking in text — split and render in-place so
        // streaming turns show correctly without a reload.
        const segments = splitThinkSegments(raw);
        return (
          <>
            {segments.map((seg) =>
              seg.isThink ? (
                <ReasoningPart key={seg.id} text={seg.text} status={{ type: 'complete' }} />
              ) : (
                <TextPart key={seg.id} text={seg.text} status={status} />
              ),
            )}
          </>
        );
      }
      case 'reasoning':
        return (
          <ReasoningPart text={part.text ?? ''} status={part.status ?? { type: 'complete' }} />
        );
      case 'tool-call':
        return <>{part.toolUI ?? <ToolFallback part={part} />}</>;
      case 'data':
        return <>{part.dataRendererUI ?? null}</>;
      default:
        return null;
    }
  };

  return function AssistantMessage() {
    const stableGroupBy = useCallback(groupByThought, []);
    const createdAt = useAuiState((s) => s.message.createdAt);
    return (
      <ChatMessage sender="assistant" name={authorLabel}>
        <MessagePrimitive.GroupedParts groupBy={stableGroupBy as never}>
          {renderPart as never}
        </MessagePrimitive.GroupedParts>
        <MessagePrimitive.If hasContent={false} last>
          <ThinkingIndicator />
        </MessagePrimitive.If>
        <ChatMessageMetadata
          timestamp={<Timestamp value={createdAt.toISOString()} format="time" />}
        />
      </ChatMessage>
    );
  };
}

export function AgentConversation() {
  const { selection } = useAgentSelection();
  const { pageContext } = usePageContext();
  const { density } = useDensity();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const AssistantMessage = makeAssistantMessage(ASSISTANT_LABEL);

  const emptyTitle = pageContext ? `Ask about ${pageContext.label}` : AGENT_COPY.emptyThreads.title;
  const emptyBody = pageContext
    ? `Ask agent anything about this ${pageContext.kind.split('.').pop() ?? 'item'}.`
    : AGENT_COPY.emptyThreads.body;
  const chatDensity = CHAT_DENSITY[density];

  return (
    <>
      {/* The composer rides ChatLayout's dock rather than sitting below as a
          sibling: the dock (blur layer + scroll button + composer) renders
          unconditionally, so `composer={null}` would leave a ~100px frosted
          band glued to the transcript's bottom edge with nothing in it.
          `scrollButton` is deliberately unset — omitting it is what wires the
          default jump-to-latest button to Astryx's stream-scroll hooks. */}
      <ChatLayout density={chatDensity} composer={<AgentComposer />}>
        <ChatMessageList density={chatDensity} isStreaming={isRunning}>
          <ThreadPrimitive.Empty>
            <AgentEmpty title={emptyTitle} body={emptyBody} />
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
          {/* Stays inside the `role="log"`: the list's own inline padding is
              what replaces the old `px-4 pb-4` wrapper, and living in the
              polite live region is how an approval announces itself at all. */}
          <ChatEmbeddedHitl threadId={selection.threadId} />
        </ChatMessageList>
      </ChatLayout>
      <ToolUIRegistry />
      <ThreadListRefresher threadId={selection.threadId} />
    </>
  );
}
