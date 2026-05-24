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
import { useAgentCatalog } from '../hooks/use-agent-catalog';
import { useApprovalResolvedEvent } from '../hooks/use-approval-events';
import { useCopilotRuntime } from '../hooks/use-copilot-runtime';
import { useModelCatalog } from '../hooks/use-model-catalog';
import { useThreadMessages } from '../hooks/use-thread-messages';

const MODEL_STORAGE_KEY = 'seta.copilot.model';
const AGENT_STORAGE_KEY = 'seta.copilot.agent';

export interface CopilotSelection {
  threadId: string | undefined;
  agentName: string;
  modelKey: string;
}

export interface CopilotSelectionActions {
  setThreadId: (id: string | undefined) => void;
  setAgentName: (name: string) => void;
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

function readStored(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) ?? fallback;
}

function writeStored(key: string, value: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, value);
}

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const { defaultName: defaultAgent } = useAgentCatalog();
  const { data: catalog } = useModelCatalog();
  const defaultModel = catalog?.default ?? 'auto';

  const [threadId, setThreadIdState] = useState<string | undefined>(undefined);
  const [agentName, setAgentNameState] = useState<string>(() =>
    readStored(AGENT_STORAGE_KEY, defaultAgent),
  );
  const [modelKey, setModelKeyState] = useState<string>(() =>
    readStored(MODEL_STORAGE_KEY, defaultModel),
  );

  const setAgentName = useCallback((next: string) => {
    setAgentNameState(next);
    writeStored(AGENT_STORAGE_KEY, next);
  }, []);

  const setModelKey = useCallback((next: string) => {
    setModelKeyState(next);
    writeStored(MODEL_STORAGE_KEY, next);
  }, []);

  const setThreadId = useCallback((next: string | undefined) => {
    setThreadIdState(next);
  }, []);

  const selectionValue = useMemo<SelectionContextValue>(
    () => ({
      selection: { threadId, agentName, modelKey },
      actions: { setThreadId, setAgentName, setModelKey },
    }),
    [threadId, agentName, modelKey, setThreadId, setAgentName, setModelKey],
  );

  return (
    <SelectionContext.Provider value={selectionValue}>
      <CopilotRuntimeHost>{children}</CopilotRuntimeHost>
    </SelectionContext.Provider>
  );
}

function CopilotRuntimeHost({ children }: { children: React.ReactNode }) {
  const { selection, actions } = useCopilotSelection();
  const approvalEvent = useApprovalResolvedEvent();
  const navigate = useNavigate();
  const location = useLocation();
  const handledRevision = useRef(0);

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

  return (
    <CopilotRuntimeHostInner
      // Remount whenever the thread changes OR an HITL approval resolves —
      // matches today's `key` on ChatPane so initialMessages re-seed the runtime.
      key={`${selection.threadId ?? 'new'}::${approvalEvent.revision}`}
      threadId={selection.threadId}
      agentName={selection.agentName}
      modelKey={selection.modelKey}
    >
      {children}
    </CopilotRuntimeHostInner>
  );
}

function CopilotRuntimeHostInner({
  threadId,
  agentName,
  modelKey,
  children,
}: {
  threadId: string | undefined;
  agentName: string;
  modelKey: string;
  children: React.ReactNode;
}) {
  const { data: history, isLoading } = useThreadMessages(threadId);
  const initialMessages: UIMessage[] = threadId ? (history?.messages ?? []) : [];
  const historyLoading = Boolean(threadId) && isLoading && !history;
  const runtime = useCopilotRuntime({ agentName, threadId, modelKey, initialMessages });

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
