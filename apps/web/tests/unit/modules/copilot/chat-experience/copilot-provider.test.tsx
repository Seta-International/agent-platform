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
