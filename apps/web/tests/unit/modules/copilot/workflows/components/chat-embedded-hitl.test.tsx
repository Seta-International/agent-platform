import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowApprovalRow } from '../../../../../../src/modules/copilot/workflows/api/schemas.ts';
import { workflowsApi } from '../../../../../../src/modules/copilot/workflows/api/workflows.ts';
import { ChatEmbeddedHitl } from '../../../../../../src/modules/copilot/workflows/components/chat-embedded-hitl.tsx';

const APPROVAL_FOR_THREAD: WorkflowApprovalRow = {
  approvalId: 'a1',
  runId: 'r1',
  stepId: 'await-approval',
  proposedPayload: { displayName: 'Jane', userId: 'u-9', rationale: 'top match' },
  approverUserId: 'u-1',
  surfaceCanvas: true,
  surfaceChatThreadId: 'thread-x',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  createdAt: new Date().toISOString(),
};

const APPROVAL_OTHER_THREAD: WorkflowApprovalRow = {
  ...APPROVAL_FOR_THREAD,
  approvalId: 'a2',
  runId: 'r2',
  surfaceChatThreadId: 'thread-other',
};

function withQuery(children: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('ChatEmbeddedHitl', () => {
  it('renders only approvals for the current thread', async () => {
    vi.spyOn(workflowsApi, 'listMyPendingApprovals').mockResolvedValue([
      APPROVAL_FOR_THREAD,
      APPROVAL_OTHER_THREAD,
    ]);

    render(withQuery(<ChatEmbeddedHitl threadId="thread-x" />));

    await waitFor(() => expect(screen.getByText('Jane')).toBeInTheDocument());
    expect(screen.getAllByRole('region', { name: /your input needed/i })).toHaveLength(1);
  });

  it('renders nothing when no approvals match the thread', async () => {
    vi.spyOn(workflowsApi, 'listMyPendingApprovals').mockResolvedValue([APPROVAL_OTHER_THREAD]);
    render(withQuery(<ChatEmbeddedHitl threadId="thread-x" />));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /your input needed/i })).not.toBeInTheDocument(),
    );
  });

  it('renders nothing when threadId is undefined', async () => {
    vi.spyOn(workflowsApi, 'listMyPendingApprovals').mockResolvedValue([APPROVAL_FOR_THREAD]);
    render(withQuery(<ChatEmbeddedHitl threadId={undefined} />));
    // Allow the query to settle, then assert nothing renders
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('region', { name: /your input needed/i })).not.toBeInTheDocument();
  });
});
