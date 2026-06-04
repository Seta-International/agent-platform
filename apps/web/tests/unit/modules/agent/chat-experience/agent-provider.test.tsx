import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/agent/chat' }),
}));

// Stub useThreadMessages so the provider's `historyReady` gate never blocks
// the runtime host from rendering `{children}`. Without this, picking a
// non-fresh threadId puts the host into its "Loading chat…" branch, which
// unmounts the test hook before the state update is observable on
// `result.current`. The selection state IS updating inside the provider —
// you can see the GET to /threads/<id> fire — but the consumer hook is gone.
vi.mock('@/modules/agent/hooks/use-thread-messages', async () => {
  const actual = await vi.importActual<typeof import('@/modules/agent/hooks/use-thread-messages')>(
    '@/modules/agent/hooks/use-thread-messages',
  );
  return {
    ...actual,
    useThreadMessages: () => ({
      data: {
        thread: { id: 't', title: null, updatedAt: null },
        messages: [],
        page: 0,
        perPage: 0,
        total: 0,
        hasMore: false,
      },
      isLoading: false,
      error: null,
    }),
  };
});

import {
  AgentProvider,
  useAgentRuntimeContext,
  useAgentSelection,
  usePageContext,
  usePanelUI,
} from '@/modules/agent/chat-experience/agent-provider';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <AgentProvider>{children}</AgentProvider>
    </QueryClientProvider>
  );
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('AgentProvider', () => {
  it('mints a client-owned fresh thread id at mount (never undefined)', () => {
    // The AUI runtime falls back to an internal `__LOCALID_*` id when mounted
    // without a thread id; that id leaks to the server as the Mastra thread id
    // and orphans HITL approval rows. The provider must own the id up front.
    const { result } = renderHook(() => useAgentSelection(), { wrapper });
    expect(result.current.selection.threadId).toMatch(UUID_RE);
    expect(result.current.selection.isThreadFresh).toBe(true);
    expect(typeof result.current.selection.modelKey).toBe('string');
  });

  it('re-mints a fresh id when the selection is cleared instead of going undefined', async () => {
    const { result } = renderHook(() => useAgentSelection(), { wrapper });
    await act(async () => {
      result.current.actions.setThreadId('thread-123');
    });
    expect(result.current.selection.threadId).toBe('thread-123');
    await act(async () => {
      result.current.actions.setThreadId(undefined);
    });
    expect(result.current.selection.threadId).toMatch(UUID_RE);
    expect(result.current.selection.isThreadFresh).toBe(true);
  });

  it('updates selection via setters and persists to localStorage', async () => {
    window.localStorage.clear();
    const { result } = renderHook(() => useAgentSelection(), { wrapper });
    // Use the React 19 async-act pattern so suspended fetches inside the
    // provider (useModelCatalog / useThreadMessages) finish their abort
    // settlement between calls, otherwise the second setter races the first
    // commit and one of the updates appears to be lost.
    await act(async () => {
      result.current.actions.setModelKey('balanced-default');
    });
    await act(async () => {
      result.current.actions.setThreadId('thread-123');
    });
    expect(result.current.selection.modelKey).toBe('balanced-default');
    expect(result.current.selection.threadId).toBe('thread-123');
    expect(window.localStorage.getItem('seta.agent.model')).toBe('balanced-default');
  });

  it('throws when useAgentSelection is used outside provider', () => {
    expect(() => renderHook(() => useAgentSelection())).toThrow(/AgentProvider/);
  });
});

describe('AgentProvider runtime', () => {
  it('exposes a non-null runtime via useAgentRuntimeContext', () => {
    const { result } = renderHook(() => useAgentRuntimeContext(), { wrapper });
    expect(result.current.runtime).toBeDefined();
  });
});

describe('AgentProvider page-context', () => {
  it('starts with null pageContext and lets callers set/clear it', () => {
    const { result } = renderHook(() => usePageContext(), { wrapper });
    expect(result.current.pageContext).toBeNull();
    act(() => result.current.setPageContext({ kind: 'planner.task', id: 't1', label: 'X' }));
    expect(result.current.pageContext?.id).toBe('t1');
    act(() => result.current.setPageContext(null));
    expect(result.current.pageContext).toBeNull();
  });

  it('tracks per-(threadId, contextId) suppression and clears when threadId changes', async () => {
    const { result } = renderHook(() => ({ sel: useAgentSelection(), pc: usePageContext() }), {
      wrapper,
    });

    // The suppressFor callback closes over `threadId` and is re-created each
    // render. Awaiting each act lets the new closure commit before the next
    // call reads `result.current.pc.suppressFor`, otherwise we'd write the
    // stale `threadId: undefined` into storedSuppression.
    await act(async () => result.current.sel.actions.setThreadId('thread-A'));
    await act(async () =>
      result.current.pc.setPageContext({ kind: 'planner.task', id: 't1', label: 'X' }),
    );
    await act(async () => result.current.pc.suppressFor('t1'));
    expect(result.current.pc.suppressedFor).toBe('t1');

    await act(async () => result.current.sel.actions.setThreadId('thread-B'));
    expect(result.current.pc.suppressedFor).toBeNull();
  });
});

describe('AgentProvider panel UI', () => {
  it('starts closed and updates open state', () => {
    const { result } = renderHook(() => usePanelUI(), { wrapper });
    expect(result.current.panelOpen).toBe(false);
    act(() => result.current.setPanelOpen(true));
    expect(result.current.panelOpen).toBe(true);
  });
});
