import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../src/modules/agent/workflows/api/workflows.ts', () => ({
  workflowsApi: {
    resumeChat: vi.fn().mockResolvedValue(undefined),
    decideApproval: vi.fn().mockResolvedValue({ runId: 'r1' }),
  },
}));

import { workflowsApi } from '../../../../../src/modules/agent/workflows/api/workflows.ts';
import { useSubmitDecision } from '../../../../../src/modules/agent/workflows/hooks/use-submit-decision.ts';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useSubmitDecision', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes an agentic decision to /chat/resume', async () => {
    const { result } = renderHook(() => useSubmitDecision(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        approvalId: 'a1',
        agentic: true,
        decision: 'approve',
        overrideUserIds: ['u1'],
      });
    });
    expect(workflowsApi.resumeChat).toHaveBeenCalledWith({
      approvalId: 'a1',
      decision: 'approve',
      overrideUserIds: ['u1'],
    });
    expect(workflowsApi.decideApproval).not.toHaveBeenCalled();
  });

  it('routes an evented decision to /decide', async () => {
    const { result } = renderHook(() => useSubmitDecision(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        approvalId: 'a2',
        agentic: false,
        decision: 'reject',
        note: 'no',
      });
    });
    expect(workflowsApi.decideApproval).toHaveBeenCalledWith('a2', {
      decision: 'reject',
      note: 'no',
    });
    expect(workflowsApi.resumeChat).not.toHaveBeenCalled();
  });
});
