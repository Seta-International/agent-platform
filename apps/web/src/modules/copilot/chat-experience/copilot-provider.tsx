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
import { useApprovalResolvedEvent } from '../hooks/use-approval-events';
import { useCopilotRuntime } from '../hooks/use-copilot-runtime';
import { useModelCatalog } from '../hooks/use-model-catalog';
import { useThreadMessages } from '../hooks/use-thread-messages';

const MODEL_STORAGE_KEY = 'seta.copilot.model';

export interface CopilotSelection {
  threadId: string | undefined;
  modelKey: string;
}

export interface CopilotSelectionActions {
  setThreadId: (id: string | undefined) => void;
  setModelKey: (key: string) => void;
}

interface SelectionContextValue {
  selection: CopilotSelection;
  actions: CopilotSelectionActions;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

interface RuntimeContextValue {
  runtime: ReturnType<typeof useCopilotRuntime>;
  /** True while the runtime is waiting on `useThreadMessages` for a selected thread. */
  historyLoading: boolean;
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

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const { data: catalog } = useModelCatalog();
  const defaultModel = catalog?.default ?? 'auto';

  const [threadId, setThreadIdState] = useState<string | undefined>(undefined);
  const [modelKey, setModelKeyState] = useState<string>(() =>
    readStored(MODEL_STORAGE_KEY, defaultModel),
  );

  const setModelKey = useCallback((next: string) => {
    setModelKeyState(next);
    writeStored(MODEL_STORAGE_KEY, next);
  }, []);

  const setThreadId = useCallback((next: string | undefined) => {
    setThreadIdState(next);
  }, []);

  const selectionValue = useMemo<SelectionContextValue>(
    () => ({
      selection: { threadId, modelKey },
      actions: { setThreadId, setModelKey },
    }),
    [threadId, modelKey, setThreadId, setModelKey],
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
    <SelectionContext.Provider value={selectionValue}>
      <PageContextContext.Provider value={pageCtxValue}>
        <PanelUIContext.Provider value={panelUIValue}>
          <CopilotRuntimeHost>{children}</CopilotRuntimeHost>
        </PanelUIContext.Provider>
      </PageContextContext.Provider>
    </SelectionContext.Provider>
  );
}

function CopilotRuntimeHost({ children }: { children: React.ReactNode }) {
  const { selection, actions } = useCopilotSelection();
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
  // Pre-lift this lived in chat-screen and always redirected to /copilot/chat.
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

    if (location.pathname === '/copilot/chat') {
      void navigate({
        to: '/copilot/chat',
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
  const { data: history, isLoading } = useThreadMessages(selection.threadId);
  const historyReady = !selection.threadId || (!isLoading && Boolean(history));
  const initialMessages: UIMessage[] = selection.threadId ? (history?.messages ?? []) : [];

  return (
    <CopilotRuntimeHostInner
      // Remount whenever the thread changes, an HITL approval resolves, OR the
      // history finishes loading — that last bit guarantees the runtime is
      // seeded with the real messages instead of an empty array.
      key={`${selection.threadId ?? 'new'}::${approvalEvent.revision}::${historyReady ? 'ready' : 'pending'}`}
      threadId={selection.threadId}
      modelKey={selection.modelKey}
      initialMessages={initialMessages}
      historyLoading={!historyReady}
      pageContextRef={pageContextRef}
    >
      {children}
    </CopilotRuntimeHostInner>
  );
}

function CopilotRuntimeHostInner({
  threadId,
  modelKey,
  initialMessages,
  historyLoading,
  pageContextRef,
  children,
}: {
  threadId: string | undefined;
  modelKey: string;
  initialMessages: UIMessage[];
  historyLoading: boolean;
  pageContextRef: React.MutableRefObject<{
    ctx: PageContext | null;
    suppressedFor: string | null;
  }>;
  children: React.ReactNode;
}) {
  const runtime = useCopilotRuntime({
    threadId,
    modelKey,
    initialMessages,
    pageContextRef,
  });

  const value = useMemo<RuntimeContextValue>(
    () => ({ runtime, historyLoading }),
    [runtime, historyLoading],
  );

  return (
    <RuntimeContext.Provider value={value}>
      <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
    </RuntimeContext.Provider>
  );
}

export function useCopilotSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useCopilotSelection must be used within <CopilotProvider>');
  return ctx;
}

export function useCopilotRuntimeContext(): RuntimeContextValue {
  const ctx = useContext(RuntimeContext);
  if (!ctx) throw new Error('useCopilotRuntimeContext must be used within <CopilotProvider>');
  return ctx;
}

export function usePageContext(): PageContextValue {
  const ctx = useContext(PageContextContext);
  if (!ctx) throw new Error('usePageContext must be used within <CopilotProvider>');
  return ctx;
}

export function usePanelUI(): PanelUIValue {
  const ctx = useContext(PanelUIContext);
  if (!ctx) throw new Error('usePanelUI must be used within <CopilotProvider>');
  return ctx;
}
