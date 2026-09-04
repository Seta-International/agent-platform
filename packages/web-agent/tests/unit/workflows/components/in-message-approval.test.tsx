import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowApprovalRow } from '../../../../src/workflows/api/schemas.ts';
import { workflowsApi } from '../../../../src/workflows/api/workflows.ts';
import { InMessageApproval } from '../../../../src/workflows/components/in-message-approval.tsx';

const ROW: WorkflowApprovalRow = {
  approvalId: 'a1',
  runId: 'r1',
  stepId: 'await-approval',
  proposedPayload: {
    intent: 'Assign task to a teammate',
    summary: 'top: Jane',
    primary: { label: 'Assign to Jane', argsPatch: { assigneeUserIds: ['u-9'] } },
    alternates: [],
    decline: { label: 'Leave unassigned' },
    details: [],
    meta: { toolId: 'planner_proposeAssignment' },
  },
  approverUserId: 'u-1',
  toolCallId: 'tc-1',
  surfaceCanvas: true,
  surfaceChatThreadId: 'thread-x',
  agentic: true,
  status: 'pending',
  decisionPayload: null,
  decidedAt: null,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  createdAt: new Date().toISOString(),
};

function withQuery(children: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('InMessageApproval', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the approval whose toolCallId the turn anchors', async () => {
    vi.spyOn(workflowsApi, 'listThreadApprovals').mockResolvedValue([ROW]);

    render(withQuery(<InMessageApproval threadId="thread-x" toolCallId="tc-1" />));

    expect(await screen.findByText('Assign to Jane')).toBeInTheDocument();
  });

  it('renders the outcome in the same spot once the approval is decided', async () => {
    vi.spyOn(workflowsApi, 'listThreadApprovals').mockResolvedValue([
      { ...ROW, status: 'approved', decisionPayload: { decision: 'approve' }, decidedAt: 'now' },
    ]);

    render(withQuery(<InMessageApproval threadId="thread-x" toolCallId="tc-1" />));

    expect(await screen.findByText(/Approved/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign to Jane' })).not.toBeInTheDocument();
  });

  it('renders nothing for an anchor with no matching approval row', async () => {
    vi.spyOn(workflowsApi, 'listThreadApprovals').mockResolvedValue([ROW]);

    const { container } = render(
      withQuery(<InMessageApproval threadId="thread-x" toolCallId="tc-other" />),
    );

    await waitFor(() => expect(workflowsApi.listThreadApprovals).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
