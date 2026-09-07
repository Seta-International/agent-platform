import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/workflows/api/workflows.ts', () => ({
  workflowsApi: {
    resumeChat: vi.fn().mockResolvedValue(undefined),
    decideApproval: vi.fn().mockResolvedValue({ runId: 'r1' }),
  },
}));

import { workflowsApi } from '../../../src/workflows/api/workflows.ts';
import { useSubmitDecision } from '../../../src/workflows/hooks/use-submit-decision.ts';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useSubmitDecision', () => {
  beforeEach(() => vi.clearAllMocks());

  // FUT-816. The body shape is decided by the CARD, not by this hook: the server
  // parses it with the schema belonging to the approval's workflow_id and returns
  // 400 on a mismatch. A payload-free card must therefore arrive verbatim, with
  // no `decision` key invented on its behalf.
  it('forwards a payload-free confirm verbatim to /chat/resume', async () => {
    const { result } = renderHook(() => useSubmitDecision(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ approvalId: 'a3', agentic: true, chosen: 'primary' });
    });
    expect(workflowsApi.resumeChat).toHaveBeenCalledWith({ approvalId: 'a3', chosen: 'primary' });
  });

  it('forwards a payload-free decline verbatim', async () => {
    const { result } = renderHook(() => useSubmitDecision(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ approvalId: 'a4', agentic: true, chosen: 'decline' });
    });
    expect(workflowsApi.resumeChat).toHaveBeenCalledWith({ approvalId: 'a4', chosen: 'decline' });
  });

  it('refuses to send a payload-free confirm to /decide', async () => {
    // /decide records a legacy decision and never resumes; it has no contract for
    // `chosen`. Posting one would 400 — fail loudly here instead.
    const { result } = renderHook(() => useSubmitDecision(), { wrapper });
    await expect(
      result.current.mutateAsync({ approvalId: 'a5', agentic: false, chosen: 'primary' }),
    ).rejects.toThrow(/payload-free/i);
    expect(workflowsApi.decideApproval).not.toHaveBeenCalled();
  });

  it('forwards the alternate index the user picked', async () => {
    const { result } = renderHook(() => useSubmitDecision(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        approvalId: 'a6',
        agentic: true,
        chosen: 'alternate',
        alternateIndex: 1,
      });
    });
    expect(workflowsApi.resumeChat).toHaveBeenCalledWith({
      approvalId: 'a6',
      chosen: 'alternate',
      alternateIndex: 1,
    });
    expect(workflowsApi.decideApproval).not.toHaveBeenCalled();
  });
});
