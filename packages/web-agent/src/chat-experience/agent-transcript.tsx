import { MessagePrimitive, ThreadPrimitive, useAui, useAuiState } from '@assistant-ui/react';
import { ChatMarkdown, ChatMessage, ChatTranscript } from '@seta/shared-ui';
import { Paperclip, Sparkles } from 'lucide-react';
import { type ReactNode, useCallback } from 'react';
import { ThreadListRefresher } from '../components/thread-list-refresher';
import { ToolUIRegistry } from '../components/tool-renderers';
import { ToolFallback } from '../components/tool-renderers/tool-fallback';
import { AGENT_COPY } from '../i18n';
import { parseContextAttachment } from '../lib/context-attachment';
import { ChatEmbeddedHitl } from '../workflows/components/chat-embedded-hitl';
import { type PageContext, useAgentSelection, usePageContext } from './agent-provider';
import { ChainOfThought } from './chain-of-thought';
import { groupByThought } from './group-by-thought';
import { RenderContextBadge } from './render-context-badge';

const ASSISTANT_LABEL = 'Agent';

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
    <div className="relative">
      <ChatMarkdown text={text} />
      {status.type === 'running' && (
        <span
          aria-hidden
          className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-[2px] animate-pulse bg-ink"
        />
      )}
    </div>
  );
}

function ReasoningPart({ text, status }: PartProps) {
  const running = status.type === 'running';
  if (text.length === 0 && !running) return null;
  return (
    <div
      aria-live="polite"
      className="my-1 flex gap-2 border-l-2 border-hairline pl-3 text-caption text-ink-subtle"
    >
      {running && (
        <span
          aria-hidden
          className="mt-1 inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-primary/70"
        />
      )}
      <span className="whitespace-pre-wrap italic leading-relaxed">{text}</span>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 text-caption text-ink-subtle">
      <span aria-hidden className="inline-flex items-center gap-0.5">
        <span className="size-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.32s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.16s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-primary/70" />
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
          <span
            key={name}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2 py-1 text-caption"
          >
            <Paperclip className="size-3" aria-hidden />
            <span className="max-w-[12rem] truncate">{name}</span>
          </span>
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
        className="inline-flex size-9 items-center justify-center rounded-full bg-primary-tint text-primary"
      >
        <Sparkles className="size-4" />
      </span>
      <div className="max-w-xs">
        <h3 className="text-card-title font-semibold text-ink">{title}</h3>
        <p className="mt-1.5 text-body-sm leading-[1.5] text-ink-subtle">{body}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {AGENT_COPY.emptySuggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => send(s)}
            className="inline-flex h-7 items-center rounded-full border border-hairline bg-canvas px-3 text-caption text-ink-muted transition-colors hover:border-primary-border hover:bg-primary-tint hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus"
          >
            {s}
          </button>
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
    <ChatMessage variant="user">
      {ctx && <RenderContextBadge data={ctx} />}
      <MessagePrimitive.Parts components={{ Text: PlainTextPart }} />
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
      case 'text':
        return <TextPart text={part.text ?? ''} status={part.status ?? { type: 'complete' }} />;
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
    return (
      <ChatMessage variant="agent" author={authorLabel}>
        <MessagePrimitive.GroupedParts groupBy={stableGroupBy as never}>
          {renderPart as never}
        </MessagePrimitive.GroupedParts>
        <MessagePrimitive.If hasContent={false} last>
          <ThinkingIndicator />
        </MessagePrimitive.If>
      </ChatMessage>
    );
  };
}

export function AgentTranscript() {
  const { selection } = useAgentSelection();
  const { pageContext } = usePageContext();
  const AssistantMessage = makeAssistantMessage(ASSISTANT_LABEL);

  const emptyTitle = pageContext ? `Ask about ${pageContext.label}` : AGENT_COPY.emptyThreads.title;
  const emptyBody = pageContext
    ? `Ask agent anything about this ${pageContext.kind.split('.').pop() ?? 'item'}.`
    : AGENT_COPY.emptyThreads.body;

  return (
    <>
      <ChatTranscript>
        <ThreadPrimitive.Empty>
          <AgentEmpty title={emptyTitle} body={emptyBody} />
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
        <div className="px-4 pb-4">
          <ChatEmbeddedHitl threadId={selection.threadId} />
        </div>
      </ChatTranscript>
      <ToolUIRegistry />
      <ThreadListRefresher threadId={selection.threadId} />
    </>
  );
}
