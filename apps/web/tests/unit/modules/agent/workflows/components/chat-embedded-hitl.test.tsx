import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowApprovalRow } from '@/modules/agent/workflows/api/schemas.ts';
import { workflowsApi } from '@/modules/agent/workflows/api/workflows.ts';
import { ChatEmbeddedHitl } from '@/modules/agent/workflows/components/chat-embedded-hitl.tsx';

const PENDING_APPROVAL: WorkflowApprovalRow = {
  approvalId: 'a1',
  runId: 'r1',
  stepId: 'await-approval',
  proposedPayload: {
    intent: 'Assign task to a teammate',
    summary: 'top: Jane',
    primary: { label: 'Assign to Jane', argsPatch: { assigneeUserIds: ['u-9'] } },
    alternates: [],
    decline: { label: 'Leave unassigned' },
    details: [
      {
        kind: 'entityList',
        select: 'multi',
        items: [
          {
            id: 'u-9',
            type: 'user',
            label: 'Jane',
            secondary: 'top match',
            score: 0.9,
            primary: true,
          },
        ],
      },
      { kind: 'confidence', score: 0.9 },
    ],
    meta: { toolId: 'planner_proposeAssignment' },
  },
  approverUserId: 'u-1',
  surfaceCanvas: true,
  surfaceChatThreadId: 'thread-x',
  agentic: false,
  status: 'pending',
  decisionPayload: null,
  decidedAt: null,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  createdAt: new Date().toISOString(),
};

const APPROVED_APPROVAL: WorkflowApprovalRow = {
  ...PENDING_APPROVAL,
  approvalId: 'a2',
  runId: 'r2',
  status: 'approved',
  decisionPayload: { decision: 'approve' },
  decidedAt: new Date().toISOString(),
};

function withQuery(children: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('ChatEmbeddedHitl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an interactive card for pending approvals', async () => {
    vi.spyOn(workflowsApi, 'listThreadApprovals').mockResolvedValue([PENDING_APPROVAL]);

    render(withQuery(<ChatEmbeddedHitl threadId="thread-x" />));

    await waitFor(() => expect(screen.getAllByText('Jane').length).toBeGreaterThan(0));
    expect(screen.getAllByRole('region', { name: /assign task to a teammate/i })).toHaveLength(1);
    expect(workflowsApi.listThreadApprovals).toHaveBeenCalledWith('thread-x');
  });

  it('renders decided approvals as a persistent outcome row', async () => {
    vi.spyOn(workflowsApi, 'listThreadApprovals').mockResolvedValue([APPROVED_APPROVAL]);

    render(withQuery(<ChatEmbeddedHitl threadId="thread-x" />));

    await waitFor(() => expect(screen.getByText('Approved.')).toBeInTheDocument());
    expect(screen.getByText('Task assigned to Jane.')).toBeInTheDocument();
    // No interactive card for a decided approval.
    expect(
      screen.queryByRole('region', { name: /assign task to a teammate/i }),
    ).not.toBeInTheDocument();
  });

  it('renders nothing when the thread has no approvals', async () => {
    vi.spyOn(workflowsApi, 'listThreadApprovals').mockResolvedValue([]);
    render(withQuery(<ChatEmbeddedHitl threadId="thread-x" />));
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: /in-thread approvals/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it("invalidates the deciding tool's module queries after a decision", async () => {
    vi.spyOn(workflowsApi, 'listThreadApprovals').mockResolvedValue([PENDING_APPROVAL]);
    vi.spyOn(workflowsApi, 'decideApproval').mockResolvedValue({ runId: 'r1' });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    render(
      <QueryClientProvider client={qc}>
        <ChatEmbeddedHitl threadId="thread-x" />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /assign to jane/i })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: /assign to jane/i }));

    await waitFor(() => expect(workflowsApi.decideApproval).toHaveBeenCalled());
    // The chat-HITL decider already executed the planner write server-side, so
    // the planner read models (task detail assignees, boards) are stale.
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['planner'] })),
    );
  });

  it('renders nothing when threadId is undefined', async () => {
    const spy = vi.spyOn(workflowsApi, 'listThreadApprovals').mockResolvedValue([PENDING_APPROVAL]);
    render(withQuery(<ChatEmbeddedHitl threadId={undefined} />));
    // The query is disabled without a threadId, so the API is never called.
    await new Promise((r) => setTimeout(r, 30));
    expect(spy).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('region', { name: /assign task to a teammate/i }),
    ).not.toBeInTheDocument();
  });
});
