import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useAgentCatalog } from '../hooks/use-agent-catalog';
import { useModelCatalog } from '../hooks/use-model-catalog';

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

  return <SelectionContext.Provider value={selectionValue}>{children}</SelectionContext.Provider>;
}

export function useCopilotSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useCopilotSelection must be used within <CopilotProvider>');
  return ctx;
}
