import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/copilot/chat' }),
}));

import {
  CopilotProvider,
  useCopilotRuntimeContext,
  useCopilotSelection,
  usePageContext,
  usePanelUI,
} from '@/modules/copilot/chat-experience/copilot-provider';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <CopilotProvider>{children}</CopilotProvider>
    </QueryClientProvider>
  );
};

describe('CopilotProvider', () => {
  it('exposes default selection (undefined thread, defaults for agent/model)', () => {
    const { result } = renderHook(() => useCopilotSelection(), { wrapper });
    expect(result.current.selection.threadId).toBeUndefined();
    expect(typeof result.current.selection.agentName).toBe('string');
    expect(typeof result.current.selection.modelKey).toBe('string');
  });

  it('updates selection via setters and persists to localStorage', () => {
    window.localStorage.clear();
    const { result } = renderHook(() => useCopilotSelection(), { wrapper });
    act(() => {
      result.current.actions.setAgentName('planner-agent');
      result.current.actions.setModelKey('balanced-default');
      result.current.actions.setThreadId('thread-123');
    });
    expect(result.current.selection.agentName).toBe('planner-agent');
    expect(result.current.selection.modelKey).toBe('balanced-default');
    expect(result.current.selection.threadId).toBe('thread-123');
    expect(window.localStorage.getItem('seta.copilot.agent')).toBe('planner-agent');
    expect(window.localStorage.getItem('seta.copilot.model')).toBe('balanced-default');
  });

  it('throws when useCopilotSelection is used outside provider', () => {
    expect(() => renderHook(() => useCopilotSelection())).toThrow(/CopilotProvider/);
  });
});

describe('CopilotProvider runtime', () => {
  it('exposes a non-null runtime via useCopilotRuntimeContext', () => {
    const { result } = renderHook(() => useCopilotRuntimeContext(), { wrapper });
    expect(result.current.runtime).toBeDefined();
  });
});

describe('CopilotProvider page-context', () => {
  it('starts with null pageContext and lets callers set/clear it', () => {
    const { result } = renderHook(() => usePageContext(), { wrapper });
    expect(result.current.pageContext).toBeNull();
    act(() => result.current.setPageContext({ kind: 'planner.task', id: 't1', label: 'X' }));
    expect(result.current.pageContext?.id).toBe('t1');
    act(() => result.current.setPageContext(null));
    expect(result.current.pageContext).toBeNull();
  });

  it('tracks per-(threadId, contextId) suppression and clears when threadId changes', () => {
    const { result } = renderHook(() => ({ sel: useCopilotSelection(), pc: usePageContext() }), {
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

describe('CopilotProvider panel UI', () => {
  it('starts closed and updates open state', () => {
    const { result } = renderHook(() => usePanelUI(), { wrapper });
    expect(result.current.panelOpen).toBe(false);
    act(() => result.current.setPanelOpen(true));
    expect(result.current.panelOpen).toBe(true);
  });
});
