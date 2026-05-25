import { MessagePrimitive, ThreadPrimitive, useAui, useAuiState } from '@assistant-ui/react';
import { ChatMarkdown, ChatMessage, ChatTranscript } from '@seta/shared-ui';
import { Sparkles } from 'lucide-react';
import { ThreadListRefresher } from '../components/thread-list-refresher';
import { ToolUIRegistry } from '../components/tool-renderers';
import { COPILOT_COPY } from '../i18n';
import { ChatEmbeddedHitl } from '../workflows/components/chat-embedded-hitl';
import { type PageContext, useCopilotSelection, usePageContext } from './copilot-provider';
import { RenderContextBadge } from './render-context-badge';

const ASSISTANT_LABEL = 'Copilot';

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
  return (
    <details className="my-2 rounded-md border border-hairline bg-surface-2 px-3 py-2 text-caption">
      <summary className="cursor-pointer select-none text-ink-subtle">
        {running ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary" />
            Thinking…
          </span>
        ) : (
          'See my thinking'
        )}
      </summary>
      <div className="mt-2 whitespace-pre-wrap text-ink-muted">{text}</div>
    </details>
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
  return <span className="whitespace-pre-wrap">{text}</span>;
}

function CopilotEmpty({ title, body }: { title: string; body: string }) {
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
        {COPILOT_COPY.emptySuggestions.map((s) => (
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
  return function AssistantMessage() {
    return (
      <ChatMessage variant="agent" author={authorLabel}>
        <MessagePrimitive.Parts components={{ Text: TextPart, Reasoning: ReasoningPart }} />
        <MessagePrimitive.If hasContent={false} last>
          <ThinkingIndicator />
        </MessagePrimitive.If>
      </ChatMessage>
    );
  };
}

export function CopilotTranscript() {
  const { selection } = useCopilotSelection();
  const { pageContext } = usePageContext();
  const AssistantMessage = makeAssistantMessage(ASSISTANT_LABEL);

  const emptyTitle = pageContext
    ? `Ask about ${pageContext.label}`
    : COPILOT_COPY.emptyThreads.title;
  const emptyBody = pageContext
    ? `Ask copilot anything about this ${pageContext.kind.split('.').pop() ?? 'item'}.`
    : COPILOT_COPY.emptyThreads.body;

  return (
    <>
      <ChatTranscript>
        <ThreadPrimitive.Empty>
          <CopilotEmpty title={emptyTitle} body={emptyBody} />
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
