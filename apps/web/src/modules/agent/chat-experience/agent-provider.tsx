/* eslint-disable react-refresh/only-export-components -- provider component and its selector hooks are co-located; splitting them would force every consumer through an extra re-export shim */
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import type { UIMessage } from 'ai';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAgentRuntime } from '../hooks/use-agent-runtime';
import { useApprovalResolvedEvent } from '../hooks/use-approval-events';
import { useIsThreadFresh } from '../hooks/use-is-thread-fresh';
import { useModelCatalog } from '../hooks/use-model-catalog';
import { ThreadMessagesError, useThreadMessages } from '../hooks/use-thread-messages';
import { markThreadFresh, markThreadKnown } from '../lib/fresh-thread-store';
import { DensityProvider } from './use-density';

const MODEL_STORAGE_KEY = 'seta.agent.model';

export interface AgentSelection {
  /**
   * Always a client-owned id. The provider mints a fresh uuid at mount and
   * whenever the selection is cleared, so the AUI runtime is never mounted
   * without one — if it were, assistant-ui would fall back to an internal
   * `__LOCALID_*` id, send THAT to the server on the first message, and every
   * server-side row keyed by thread id (Mastra thread, HITL approval rows)
   * would land on an id no client query ever looks at.
   */
  threadId: string;
  modelKey: string;
  /**
   * True when `threadId` was minted client-side and the Mastra row hasn't been
   * created yet. Consumers (e.g. `useThreadMessages`, the rail's edit/delete
   * affordances) use this to skip server calls that would 404.
   */
  isThreadFresh: boolean;
}

export interface AgentSelectionActions {
  /** Select a server-known thread; `undefined` means "new conversation" and re-mints a fresh id. */
  setThreadId: (id: string | undefined) => void;
  setModelKey: (key: string) => void;
  /**
   * Mint a fresh thread id and select it. The id is owned by the client so the
   * URL, the AUI runtime, and the Mastra row all agree from the first send,
   * which prevents the post-stream URL flip from remounting the runtime and
   * killing the title-poll effects. Returns the new id so callers (e.g. the
   * /agent/chat rail) can push it into the URL.
   */
  startFreshThread: () => string;
}

interface SelectionContextValue {
  selection: AgentSelection;
  actions: AgentSelectionActions;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

interface RuntimeContextValue {
  runtime: ReturnType<typeof useAgentRuntime>;
  /** True while the runtime is waiting on `useThreadMessages` for a selected thread. */
  historyLoading: boolean;
  /** Last run error (e.g. the chat 413 context-overflow), parsed for display. */
  runError: string | null;
  /** Clear the last run error (e.g. when the user sends a new message). */
  clearRunError: () => void;
}

/**
 * The AI SDK transport throws `new Error(<response body text>)` on a non-ok
 * response, so a JSON error body arrives as the error message. Extract the
 * human-readable `message` field when present.
 */
function describeRunError(error: Error): string {
  const raw = error.message;
  try {
    const body = JSON.parse(raw) as { message?: unknown };
    if (typeof body.message === 'string' && body.message) return body.message;
  } catch {
    /* not JSON — fall through to the raw text */
  }
  return raw || 'Something went wrong. Please try again.';
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

export type { PageContext } from '../lib/page-context-types';

import type { PageContext } from '../lib/page-context-types';

interface PageContextValue {
  pageContext: PageContext | null;
  setPageContext: (next: PageContext | null) => void;
  suppressedFor: string | null;
  suppressFor: (contextId: string) => void;
  clearSuppression: () => void;
}

interface PanelUIValue {
  panelOpen: boolean;
  setPanelOpen: (next: boolean) => void;
  /**
   * Set by callers (e.g. planner "Suggest assignee" button) to deliver a
   * one-shot prompt into the open chat. Composer reads and clears it on the
   * next render so reopening the panel doesn't re-fire.
   */
  pendingPrompt: { text: string; autoSend: boolean } | null;
  setPendingPrompt: (next: { text: string; autoSend: boolean } | null) => void;
}

const PageContextContext = createContext<PageContextValue | null>(null);
const PanelUIContext = createContext<PanelUIValue | null>(null);

function readStored(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) ?? fallback;
}

function writeStored(key: string, value: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, value);
}

/**
 * Same mint-before-mount contract as the /agent/chat route's `beforeLoad`:
 * own the id client-side so the URL, the AUI runtime, and the Mastra row all
 * agree from the first send. `markThreadFresh` is idempotent, so the lazy
 * useState initializer may safely run twice under StrictMode.
 */
function mintFreshThreadId(): string {
  const id = crypto.randomUUID();
  markThreadFresh(id);
  return id;
}

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const { data: catalog } = useModelCatalog();
  const defaultModel = catalog?.default ?? 'auto';

  const [threadId, setThreadIdState] = useState<string>(mintFreshThreadId);
  const [modelKey, setModelKeyState] = useState<string>(() =>
    readStored(MODEL_STORAGE_KEY, defaultModel),
  );
  // Subscribes to the cross-cutting fresh-thread store (shared with the route
  // `beforeLoad`). Re-renders the provider exactly when the freshness of the
  // currently selected id changes.
  const isThreadFresh = useIsThreadFresh(threadId);

  const setModelKey = useCallback((next: string) => {
    setModelKeyState(next);
    writeStored(MODEL_STORAGE_KEY, next);
  }, []);

  const setThreadId = useCallback((next: string | undefined) => {
    if (next === undefined) {
      // "No thread" means "new conversation" — re-mint instead of clearing so
      // the runtime is never left without a client-owned id (see AgentSelection).
      setThreadIdState(mintFreshThreadId());
      return;
    }
    setThreadIdState(next);
    // A direct selection of an id means the caller believes the row exists on
    // the server (e.g. clicking a row in the rail, an approval-driven switch).
    // Clear it from the fresh set so consumers stop treating it as new.
    markThreadKnown(next);
  }, []);

  const startFreshThread = useCallback(() => {
    const id = mintFreshThreadId();
    setThreadIdState(id);
    return id;
  }, []);

  const selectionValue = useMemo<SelectionContextValue>(
    () => ({
      selection: { threadId, modelKey, isThreadFresh },
      actions: { setThreadId, setModelKey, startFreshThread },
    }),
    [threadId, modelKey, isThreadFresh, setThreadId, setModelKey, startFreshThread],
  );

  const [pageContext, setPageContextState] = useState<PageContext | null>(null);
  // Pair the suppression with the thread it was set for so it auto-invalidates on switch.
  const [storedSuppression, setStoredSuppression] = useState<{
    threadId: string | undefined;
    contextId: string;
  } | null>(null);
  const suppressedFor =
    storedSuppression && storedSuppression.threadId === threadId
      ? storedSuppression.contextId
      : null;
  const [panelOpen, setPanelOpenState] = useState<boolean>(false);
  const [pendingPrompt, setPendingPromptState] = useState<{
    text: string;
    autoSend: boolean;
  } | null>(null);

  const setPageContext = useCallback((next: PageContext | null) => {
    setPageContextState((prev) => {
      if (prev === next) return prev;
      if (
        prev &&
        next &&
        prev.kind === next.kind &&
        prev.id === next.id &&
        prev.label === next.label &&
        prev.summary === next.summary
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const suppressFor = useCallback(
    (contextId: string) => setStoredSuppression({ threadId, contextId }),
    [threadId],
  );
  const clearSuppression = useCallback(() => setStoredSuppression(null), []);
  const setPanelOpen = useCallback((next: boolean) => setPanelOpenState(next), []);
  const setPendingPrompt = useCallback(
    (next: { text: string; autoSend: boolean } | null) => setPendingPromptState(next),
    [],
  );

  const pageCtxValue = useMemo<PageContextValue>(
    () => ({ pageContext, setPageContext, suppressedFor, suppressFor, clearSuppression }),
    [pageContext, setPageContext, suppressedFor, suppressFor, clearSuppression],
  );

  const panelUIValue = useMemo<PanelUIValue>(
    () => ({ panelOpen, setPanelOpen, pendingPrompt, setPendingPrompt }),
    [panelOpen, setPanelOpen, pendingPrompt, setPendingPrompt],
  );

  return (
    <DensityProvider>
      <SelectionContext.Provider value={selectionValue}>
        <PageContextContext.Provider value={pageCtxValue}>
          <PanelUIContext.Provider value={panelUIValue}>
            <AgentRuntimeHost>{children}</AgentRuntimeHost>
          </PanelUIContext.Provider>
        </PageContextContext.Provider>
      </SelectionContext.Provider>
    </DensityProvider>
  );
}

function AgentRuntimeHost({ children }: { children: React.ReactNode }) {
  const { selection, actions } = useAgentSelection();
  const { pageContext, suppressedFor } = usePageContext();
  const approvalEvent = useApprovalResolvedEvent();
  const navigate = useNavigate();
  const location = useLocation();
  const handledRevision = useRef(0);

  // Ref read by the runtime's toCreateMessage override at send time; mirrors
  // the live PageContext state so callers can detach without re-mounting the runtime.
  const pageContextRef = useRef<{ ctx: PageContext | null; suppressedFor: string | null }>({
    ctx: pageContext,
    suppressedFor,
  });
  useEffect(() => {
    pageContextRef.current = { ctx: pageContext, suppressedFor };
  }, [pageContext, suppressedFor]);

  // Approval-driven thread switch.
  // Pre-lift this lived in chat-screen and always redirected to /agent/chat.
  // After the lift, the provider runs everywhere, so only redirect when the user
  // is already on the dedicated chat surface. On any other route just update the
  // selected thread so the resumed conversation becomes active.
  useEffect(() => {
    if (approvalEvent.revision === 0) return;
    if (approvalEvent.revision === handledRevision.current) return;
    handledRevision.current = approvalEvent.revision;
    if (!approvalEvent.threadId) return;
    if (approvalEvent.threadId === selection.threadId) return;

    actions.setThreadId(approvalEvent.threadId);

    if (location.pathname === '/agent/chat') {
      void navigate({
        to: '/agent/chat',
        search: { thread: approvalEvent.threadId },
        replace: true,
      });
    }
  }, [
    approvalEvent.revision,
    approvalEvent.threadId,
    selection.threadId,
    actions,
    navigate,
    location.pathname,
  ]);

  // Fetch history at this level so we can defer mounting the runtime until the
  // messages are in hand. `useChatRuntime` snapshots `initialMessages` only on
  // first render, so without this gate clicking a thread before history loads
  // seeds the runtime with [] and the conversation never appears.
  //
  // Fresh client-minted ids have no row on the server yet — skip the fetch and
  // mount immediately with no history. We also defensively treat a 404 as
  // "fresh" so a page reload that lost the sessionStorage entry still mounts
  // an empty chat instead of looping on the loading placeholder.
  const messagesEnabled = !selection.isThreadFresh;
  const {
    data: history,
    isLoading,
    error,
  } = useThreadMessages(messagesEnabled ? selection.threadId : undefined);
  const treatAsFresh =
    selection.isThreadFresh || (error instanceof ThreadMessagesError && error.status === 404);
  const historyReady = treatAsFresh || (!isLoading && Boolean(history));
  const initialMessages: UIMessage[] =
    messagesEnabled && !treatAsFresh ? (history?.messages ?? []) : [];

  // Do NOT include `historyReady` in the remount key.
  //
  // Previously the key was `${threadId}::${revision}::${historyReady}` which
  // caused a remount the moment history finished loading (false → true).  On
  // remount, `useChatRuntime` / AI SDK generates a new internal thread ID
  // (assistant-ui reads it from its own AUI store, ignoring any `id` we pass
  // in options).  Subsequent messages were sent with the new internal ID
  // instead of the URL thread ID, so HITL approval rows ended up in a
  // different thread and the card never appeared.
  //
  // The fix: defer mounting until history is ready, then keep the runtime
  // alive for the lifetime of that (threadId × approvalRevision) pair.
  if (!historyReady) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center text-caption text-ink-subtle">
        Loading chat…
      </div>
    );
  }

  return (
    <AgentRuntimeHostInner
      // Remount only when the thread changes or an HITL approval resolves.
      key={`${selection.threadId}::${approvalEvent.revision}`}
      threadId={selection.threadId}
      modelKey={selection.modelKey}
      initialMessages={initialMessages}
      historyLoading={false}
      pageContextRef={pageContextRef}
    >
      {children}
    </AgentRuntimeHostInner>
  );
}

function AgentRuntimeHostInner({
  threadId,
  modelKey,
  initialMessages,
  historyLoading,
  pageContextRef,
  children,
}: {
  threadId: string;
  modelKey: string;
  initialMessages: UIMessage[];
  historyLoading: boolean;
  pageContextRef: React.MutableRefObject<{
    ctx: PageContext | null;
    suppressedFor: string | null;
  }>;
  children: React.ReactNode;
}) {
  const [runError, setRunError] = useState<string | null>(null);
  const handleError = useCallback((error: Error) => setRunError(describeRunError(error)), []);
  const clearRunError = useCallback(() => setRunError(null), []);

  const runtime = useAgentRuntime({
    threadId,
    modelKey,
    initialMessages,
    pageContextRef,
    onError: handleError,
  });

  const value = useMemo<RuntimeContextValue>(
    () => ({ runtime, historyLoading, runError, clearRunError }),
    [runtime, historyLoading, runError, clearRunError],
  );

  return (
    <RuntimeContext.Provider value={value}>
      <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
    </RuntimeContext.Provider>
  );
}

export function useAgentSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useAgentSelection must be used within <AgentProvider>');
  return ctx;
}

export function useAgentRuntimeContext(): RuntimeContextValue {
  const ctx = useContext(RuntimeContext);
  if (!ctx) throw new Error('useAgentRuntimeContext must be used within <AgentProvider>');
  return ctx;
}

export function usePageContext(): PageContextValue {
  const ctx = useContext(PageContextContext);
  if (!ctx) throw new Error('usePageContext must be used within <AgentProvider>');
  return ctx;
}

export function usePanelUI(): PanelUIValue {
  const ctx = useContext(PanelUIContext);
  if (!ctx) throw new Error('usePanelUI must be used within <AgentProvider>');
  return ctx;
}
