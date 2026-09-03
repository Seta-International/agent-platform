import { MessagePrimitive, ThreadPrimitive, useAui, useAuiState } from '@assistant-ui/react';
import {
  Button,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatMessageMetadata,
  ChatSystemMessage,
  ClickableCard,
  Grid,
  Heading,
  Markdown,
  Text,
  Timestamp,
  ToggleButton,
  ToggleButtonGroup,
} from '@seta/shared-ui';
import { AtSign, Paperclip, Sparkles } from 'lucide-react';
import { type ReactNode, useCallback, useState } from 'react';
import { ThreadListRefresher } from '../components/thread-list-refresher';
import { ToolUIRegistry } from '../components/tool-renderers';
import { ToolFallback } from '../components/tool-renderers/tool-fallback';
import { AGENT_COPY, EMPTY_LANES, type EmptyLaneId } from '../i18n';
import { parseContextAttachment } from '../lib/context-attachment';
import { extractMentions } from '../lib/mention-part';
import { ChatEmbeddedHitl } from '../workflows/components/chat-embedded-hitl';
import { AgentComposer } from './agent-composer';
import { type PageContext, useAgentSelection, usePageContext } from './agent-provider';
import { ChainOfThought } from './chain-of-thought';
import { ContextChip } from './context-chip';
import { groupByThought } from './group-by-thought';
import { RenderContextBadge } from './render-context-badge';
import { type BubbleGroup, bubbleGroup, dateDividerLabel } from './transcript-structure';

const ASSISTANT_LABEL = 'Agent';

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

function TextPart({ text, status, group }: PartProps & { group?: BubbleGroup }) {
  // While the assistant is still queueing the first token, the part exists with
  // empty text; rendering anything here would stack a stray cursor above the
  // ThinkingIndicator that the transcript shows for empty turns.
  if (text.length === 0) return null;
  return (
    <ChatMessageBubble variant="ghost" group={group}>
      <div className="relative">
        {/* `autolink`: the deleted ChatMarkdown ran remark-gfm, whose
            autolink-literal extension is on by default. Astryx's is opt-in, so
            without this a bare URL in an answer renders as dead plain text. */}
        <Markdown density="compact" autolink="gfm" headingLevelStart={3}>
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
      className="my-1 flex gap-2 border-l-2 border-border pl-3 text-sm text-secondary"
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
    <div className="flex items-center gap-2 text-sm text-secondary">
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
          <ContextChip key={name} kind="file" label={name} icon={<Paperclip aria-hidden />} />
        ))}
      </div>
    );
  }
  return <span className="whitespace-pre-wrap leading-relaxed">{text}</span>;
}

function useComposerSend() {
  const aui = useAui();
  // setText + send are two separate composer() reads in the real API; keep the
  // handler stable so ClickableCard/Button onClick identities don't churn.
  return useCallback(
    (text: string) => {
      aui.composer().setText(text);
      aui.composer().send();
    },
    [aui],
  );
}

function LaneGreeting({ onSend }: { onSend: (text: string) => void }) {
  const [laneId, setLaneId] = useState<EmptyLaneId>('general');
  const lane = EMPTY_LANES.find((l) => l.id === laneId) ?? EMPTY_LANES[0];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <div className="max-w-md">
        <Heading level={2}>Where should we start?</Heading>
        <Text type="body" color="secondary">
          Pick a lane, or just ask.
        </Text>
      </div>
      <ToggleButtonGroup
        label="Suggestion lane"
        size="sm"
        value={laneId}
        // Single-select groups emit null when the active button is re-clicked;
        // a lane must always stay selected, so ignore the deselect.
        onChange={(next) => {
          if (next) setLaneId(next as EmptyLaneId);
        }}
      >
        {EMPTY_LANES.map((l) => (
          <ToggleButton key={l.id} value={l.id} label={l.label} />
        ))}
      </ToggleButtonGroup>
      <Grid columns={{ minWidth: 200, max: 3 }} gap={3} width="100%" maxWidth={640}>
        {lane.cards.map((card) => (
          <ClickableCard
            key={card.prompt}
            // aria-label carries the sent prompt so the a11y name matches the action.
            label={card.prompt}
            padding={4}
            onClick={() => onSend(card.prompt)}
          >
            <div className="flex flex-col gap-1 text-left">
              <Text type="body" weight="bold">
                {card.title}
              </Text>
              <Text type="supporting" color="secondary">
                {card.prompt}
              </Text>
            </div>
          </ClickableCard>
        ))}
      </Grid>
    </div>
  );
}

// Page-scoped empty state — kept structurally as-is (Slice C keeps today's
// pageContext branch); only the raw <h3>/<p> became Heading/Text primitives.
function PageScopedEmpty({
  pageContext,
  onSend,
}: {
  pageContext: PageContext;
  onSend: (text: string) => void;
}) {
  const kind = pageContext.kind.split('.').pop() ?? 'item';
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-12 text-center">
      <span
        aria-hidden
        className="inline-flex size-9 items-center justify-center rounded-full bg-accent-muted text-accent"
      >
        <Sparkles className="size-4" />
      </span>
      <div className="max-w-xs">
        <Heading level={3}>{`Ask about ${pageContext.label}`}</Heading>
        <Text type="body" color="secondary">
          {`Ask agent anything about this ${kind}.`}
        </Text>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {AGENT_COPY.emptySuggestions.map((s) => (
          <Button
            key={s}
            type="button"
            variant="secondary"
            size="sm"
            label={s}
            onClick={() => onSend(s)}
          />
        ))}
      </div>
    </div>
  );
}

function AgentEmpty({ pageContext }: { pageContext: PageContext | null }) {
  const onSend = useComposerSend();
  return pageContext ? (
    <PageScopedEmpty pageContext={pageContext} onSend={onSend} />
  ) : (
    <LaneGreeting onSend={onSend} />
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

// A divider is derived per-message rather than injected into a list we own:
// assistant-ui renders each message in its own runtime context, so the only
// honest seam is to compare this message's day to the previous message's day
// via thread state. Returns nothing on same-day / streaming-placeholder rows.
function DateDivider() {
  const label = useAuiState((s) => {
    const index = s.message.index;
    const current = s.message.createdAt;
    if (!(current instanceof Date)) return null;
    const previous = index > 0 ? s.thread.messages[index - 1]?.createdAt : undefined;
    return dateDividerLabel(current, previous instanceof Date ? previous : undefined, new Date());
  });
  if (!label) return null;
  return <ChatSystemMessage variant="divider">{label}</ChatSystemMessage>;
}

function UserMessage() {
  const content = useAuiState((s) => s.message.content);
  const ctx = extractPageContext(content);
  const mentions = extractMentions(content);
  return (
    <>
      <DateDivider />
      <ChatMessage sender="user">
        <ChatMessageBubble>
          {ctx && <RenderContextBadge data={ctx} />}
          {mentions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {mentions.map((m) => (
                <ContextChip
                  key={`${m.kind}:${m.id}`}
                  kind={m.kind}
                  label={m.label}
                  icon={<AtSign aria-hidden />}
                />
              ))}
            </div>
          )}
          <MessagePrimitive.Parts components={{ Text: PlainTextPart }} />
        </ChatMessageBubble>
      </ChatMessage>
    </>
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
        // streaming turns show correctly without a reload. The text segments are
        // adjacent ghost bubbles, so group them as one unit (reasoning segments
        // render as bordered rows and don't count toward the group run).
        const segments = splitThinkSegments(raw);
        const textCount = segments.filter((seg) => !seg.isThink).length;
        let textPos = 0;
        return (
          <>
            {segments.map((seg) => {
              if (seg.isThink) {
                return <ReasoningPart key={seg.id} text={seg.text} status={{ type: 'complete' }} />;
              }
              const group = bubbleGroup(textPos, textCount);
              textPos += 1;
              return <TextPart key={seg.id} text={seg.text} status={status} group={group} />;
            })}
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
      <>
        <DateDivider />
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
      </>
    );
  };
}

export function AgentConversation() {
  const { selection } = useAgentSelection();
  const { pageContext } = usePageContext();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const AssistantMessage = makeAssistantMessage(ASSISTANT_LABEL);

  return (
    <>
      {/* The composer rides ChatLayout's dock rather than sitting below as a
          sibling: the dock (blur layer + scroll button + composer) renders
          unconditionally, so `composer={null}` would leave a ~100px frosted
          band glued to the transcript's bottom edge with nothing in it.
          `scrollButton` is deliberately unset — omitting it is what wires the
          default jump-to-latest button to Astryx's stream-scroll hooks. */}
      <ChatLayout density="balanced" composer={<AgentComposer />}>
        {/* Astryx's `balanced` message area is `maxWidth: 100%` (full-bleed),
            but the composer pill is capped at `max-w-[45rem]` in AgentComposer.
            Match the transcript to that same reading width so messages line up
            with the input. Must carry the flex column + flex-1 so ChatMessageList
            (itself `flex:1`) still fills the height — otherwise the empty state's
            vertical centering collapses and it sticks to the top. */}
        <div className="mx-auto flex min-h-0 w-full max-w-[45rem] flex-1 flex-col">
          <ChatMessageList density="balanced" isStreaming={isRunning}>
            <ThreadPrimitive.Empty>
              <AgentEmpty pageContext={pageContext} />
            </ThreadPrimitive.Empty>
            <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
            {/* Stays inside the `role="log"`: the list's own inline padding is
                what replaces the old `px-4 pb-4` wrapper, and living in the
                polite live region is how an approval announces itself at all. */}
            <ChatEmbeddedHitl threadId={selection.threadId} />
          </ChatMessageList>
        </div>
      </ChatLayout>
      <ToolUIRegistry threadId={selection.threadId} />
      <ThreadListRefresher threadId={selection.threadId} />
    </>
  );
}
