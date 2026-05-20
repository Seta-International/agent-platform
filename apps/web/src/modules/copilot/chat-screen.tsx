import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive } from '@assistant-ui/react';
import {
  ChatMarkdown,
  ChatMessage,
  ChatTranscript,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Sheet,
  SheetContent,
} from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import type { UIMessage } from 'ai';
import { Menu, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AgentName } from './components/agents';
import { agentLabel } from './components/agents';
import { ChatComposerContainer } from './components/chat-composer-container';
import { ChatThreadRailContainer } from './components/chat-thread-rail-container';
import { ThreadListRefresher } from './components/thread-list-refresher';
import { ToolUIRegistry } from './components/tool-renderers';
import { useAgentCatalog } from './hooks/use-agent-catalog';
import { useApprovalResolvedEvent } from './hooks/use-approval-events';
import { useCopilotRuntime } from './hooks/use-copilot-runtime';
import { useModelCatalog } from './hooks/use-model-catalog';
import { useThreadList } from './hooks/use-thread-list';
import { useThreadMessages } from './hooks/use-thread-messages';
import { useDeleteThread, useRenameThread } from './hooks/use-thread-mutations';
import { COPILOT_COPY } from './i18n';

const MODEL_STORAGE_KEY = 'seta.copilot.model';
const AGENT_STORAGE_KEY = 'seta.copilot.agent';

function usePersistentModelKey(defaultKey: string | undefined): [string, (k: string) => void] {
  const [value, setValue] = useState<string>(() => {
    if (typeof window === 'undefined') return defaultKey ?? 'auto';
    return window.localStorage.getItem(MODEL_STORAGE_KEY) ?? defaultKey ?? 'auto';
  });
  const set = (next: string) => {
    setValue(next);
    if (typeof window !== 'undefined') window.localStorage.setItem(MODEL_STORAGE_KEY, next);
  };
  return [value, set];
}

export interface ChatScreenProps {
  threadId?: string;
}

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
          'Thoughts'
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

function UserMessage() {
  return (
    <ChatMessage variant="user">
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

function useThreadTitle(threadId: string | undefined): string | undefined {
  const { groups } = useThreadList();
  if (!threadId || !groups) return undefined;
  for (const g of groups) {
    const hit = g.items.find((i) => i.id === threadId);
    if (hit) return hit.title;
  }
  return undefined;
}

interface ConversationHeaderProps {
  title: string;
  threadId: string | undefined;
  onOpenMobileNav: () => void;
}

function ConversationHeader({ title, threadId, onOpenMobileNav }: ConversationHeaderProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rename = useRenameThread();
  const remove = useDeleteThread();
  const navigate = useNavigate();
  const canEdit = Boolean(threadId);
  const editing = draft !== null;

  const startEdit = () => setDraft(title);
  const cancelEdit = () => setDraft(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const next = (draft ?? '').trim();
    setDraft(null);
    if (!threadId || !next || next === title) return;
    rename.mutate({ id: threadId, title: next });
  };

  const onDelete = () => {
    if (!threadId) return;
    if (!window.confirm('Delete this thread? This cannot be undone.')) return;
    remove.mutate(threadId, {
      onSuccess: () => void navigate({ to: '/copilot/chat', search: { thread: undefined } }),
    });
  };

  return (
    <div className="flex h-14 flex-none items-center justify-between gap-2 border-b border-hairline px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open threads"
          className="-ml-1 inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink lg:hidden"
        >
          <Menu className="size-4" aria-hidden />
        </button>
        {editing ? (
          <input
            ref={inputRef}
            value={draft ?? ''}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-section-title text-ink focus:outline-none"
          />
        ) : (
          <>
            <span className="truncate text-section-title text-ink">{title}</span>
            <button
              type="button"
              onClick={() => canEdit && startEdit()}
              disabled={!canEdit}
              aria-label="Rename thread"
              className="inline-flex size-6 items-center justify-center rounded-md text-ink-tertiary hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Pencil className="size-3.5" aria-hidden />
            </button>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Thread actions"
              disabled={!canEdit}
              className="inline-flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MoreHorizontal className="size-3.5" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            <DropdownMenuItem onSelect={startEdit} className="gap-2">
              <Pencil className="size-3.5" aria-hidden />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <Trash2 className="size-3.5" aria-hidden />
              Delete thread
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

interface ChatPaneProps {
  threadId: string | undefined;
  initialMessages: UIMessage[];
  agentName: AgentName;
  onAgentChange: (next: AgentName) => void;
  modelKey: string;
  onModelChange: (next: string) => void;
  headerTitle: string;
  onOpenMobileNav: () => void;
}

function ChatPane({
  threadId,
  initialMessages,
  agentName,
  onAgentChange,
  modelKey,
  onModelChange,
  headerTitle,
  onOpenMobileNav,
}: ChatPaneProps) {
  const runtime = useCopilotRuntime({ agentName, threadId, modelKey, initialMessages });
  const { agents } = useAgentCatalog();
  const AssistantMessage = makeAssistantMessage(agentLabel(agentName, agents));
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex min-w-0 flex-1 flex-col">
        <ConversationHeader
          title={headerTitle}
          threadId={threadId}
          onOpenMobileNav={onOpenMobileNav}
        />
        <ChatTranscript>
          <ThreadPrimitive.Empty>
            <div className="flex flex-1 items-center justify-center py-12">
              <EmptyState
                title={COPILOT_COPY.emptyThreads.title}
                description={COPILOT_COPY.emptyThreads.body}
              />
            </div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
        </ChatTranscript>
        <ToolUIRegistry agentName={agentName} />
        <ThreadListRefresher threadId={threadId} />
        <ChatComposerContainer
          agentName={agentName}
          onAgentChange={onAgentChange}
          modelKey={modelKey}
          onModelChange={onModelChange}
        />
      </div>
    </AssistantRuntimeProvider>
  );
}

function usePersistentAgentName(defaultName: string): [string, (next: string) => void] {
  const [value, setValue] = useState<string>(() => {
    if (typeof window === 'undefined') return defaultName;
    return window.localStorage.getItem(AGENT_STORAGE_KEY) ?? defaultName;
  });
  const set = (next: string) => {
    setValue(next);
    if (typeof window !== 'undefined') window.localStorage.setItem(AGENT_STORAGE_KEY, next);
  };
  return [value, set];
}

export function ChatScreen({ threadId }: ChatScreenProps) {
  const { defaultName: defaultAgent } = useAgentCatalog();
  const [agentName, setAgentName] = usePersistentAgentName(defaultAgent);
  useEffect(() => {
    if (!agentName) setAgentName(defaultAgent);
  }, [defaultAgent, agentName, setAgentName]);
  const { data: catalog } = useModelCatalog();
  const [modelKey, setModelKey] = usePersistentModelKey(catalog?.default);
  const threadTitle = useThreadTitle(threadId);
  const headerTitle = threadId ? (threadTitle ?? 'Conversation') : 'New conversation';
  const { data: history, isLoading: historyLoading } = useThreadMessages(threadId);
  const initialMessages = threadId ? (history?.messages ?? []) : [];
  const waiting = Boolean(threadId) && historyLoading && !history;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Remount ChatPane after a successful HITL approval so the resumed messages
  // (refetched by useThreadMessages) seed the assistant-ui runtime's initial state.
  // We also navigate to the just-resumed thread when the event carries a fresh id,
  // but ONLY once per event (otherwise switching threads in the rail would re-fire
  // the navigate and snap the user back to the approval's thread).
  const approvalEvent = useApprovalResolvedEvent();
  const navigate = useNavigate();
  const handledApprovalRevision = useRef(0);
  useEffect(() => {
    if (approvalEvent.revision === 0) return;
    if (approvalEvent.revision === handledApprovalRevision.current) return;
    handledApprovalRevision.current = approvalEvent.revision;
    if (!approvalEvent.threadId || approvalEvent.threadId === threadId) return;
    void navigate({
      to: '/copilot/chat',
      search: { thread: approvalEvent.threadId },
      replace: true,
    });
  }, [approvalEvent.revision, approvalEvent.threadId, threadId, navigate]);

  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="hidden lg:flex">
        <ChatThreadRailContainer activeThreadId={threadId} />
      </div>
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          hideClose
          className="w-[280px] border-r border-hairline bg-surface-1 p-0 sm:max-w-none lg:hidden"
        >
          <ChatThreadRailContainer
            activeThreadId={threadId}
            onAfterNavigate={() => setMobileNavOpen(false)}
            className="w-full border-r-0 lg:w-full"
          />
        </SheetContent>
      </Sheet>
      {waiting ? (
        <div className="flex min-w-0 flex-1 items-center justify-center text-caption text-ink-subtle">
          Loading conversation…
        </div>
      ) : (
        <ChatPane
          key={`${threadId ?? 'new'}::${approvalEvent.revision}`}
          threadId={threadId}
          initialMessages={initialMessages}
          agentName={agentName}
          onAgentChange={setAgentName}
          modelKey={modelKey}
          onModelChange={setModelKey}
          headerTitle={headerTitle}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
      )}
    </div>
  );
}
