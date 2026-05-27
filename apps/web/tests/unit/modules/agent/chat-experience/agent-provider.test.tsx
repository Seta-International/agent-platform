import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/agent/chat' }),
}));

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

describe('AgentProvider', () => {
  it('exposes default selection (undefined thread, default model)', () => {
    const { result } = renderHook(() => useAgentSelection(), { wrapper });
    expect(result.current.selection.threadId).toBeUndefined();
    expect(typeof result.current.selection.modelKey).toBe('string');
  });

  it('updates selection via setters and persists to localStorage', () => {
    window.localStorage.clear();
    const { result } = renderHook(() => useAgentSelection(), { wrapper });
    act(() => {
      result.current.actions.setModelKey('balanced-default');
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

  it('tracks per-(threadId, contextId) suppression and clears when threadId changes', () => {
    const { result } = renderHook(() => ({ sel: useAgentSelection(), pc: usePageContext() }), {
      wrapper,
    });

    act(() => result.current.sel.actions.setThreadId('thread-A'));
    act(() => result.current.pc.setPageContext({ kind: 'planner.task', id: 't1', label: 'X' }));
    act(() => result.current.pc.suppressFor('t1'));
    expect(result.current.pc.suppressedFor).toBe('t1');

    act(() => result.current.sel.actions.setThreadId('thread-B'));
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
