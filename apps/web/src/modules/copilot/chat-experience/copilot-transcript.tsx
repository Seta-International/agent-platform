import { MessagePrimitive, ThreadPrimitive, useAuiState } from '@assistant-ui/react';
import { ChatMarkdown, ChatMessage, ChatTranscript, EmptyState } from '@seta/shared-ui';
import type { AgentName } from '../components/agents';
import { agentLabel } from '../components/agents';
import { ThreadListRefresher } from '../components/thread-list-refresher';
import { ToolUIRegistry } from '../components/tool-renderers';
import { useAgentCatalog } from '../hooks/use-agent-catalog';
import { COPILOT_COPY } from '../i18n';
import { ChatEmbeddedHitl } from '../workflows/components/chat-embedded-hitl';
import { type PageContext, useCopilotSelection, usePageContext } from './copilot-provider';
import { RenderContextBadge } from './render-context-badge';

interface PartProps {
  text: string;
  status: { type: string };
}

function TextPart({ text, status }: PartProps) {
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
    <span className="inline-flex items-center gap-1 text-ink-subtle">
      <span className="size-1.5 animate-pulse rounded-full bg-ink-subtle [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-pulse rounded-full bg-ink-subtle [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-pulse rounded-full bg-ink-subtle" />
    </span>
  );
}

function PlainTextPart({ text }: PartProps) {
  return <span className="whitespace-pre-wrap">{text}</span>;
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
  const { agents } = useAgentCatalog();
  const { pageContext } = usePageContext();
  const AssistantMessage = makeAssistantMessage(
    agentLabel(selection.agentName as AgentName, agents),
  );

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
          <div className="flex flex-1 items-center justify-center py-12">
            <EmptyState title={emptyTitle} description={emptyBody} />
          </div>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
        <div className="px-4 pb-4">
          <ChatEmbeddedHitl threadId={selection.threadId} />
        </div>
      </ChatTranscript>
      <ToolUIRegistry agentName={selection.agentName as AgentName} />
      <ThreadListRefresher threadId={selection.threadId} />
    </>
  );
}
