import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/agent/workflows/api/workflows.ts', () => ({
  workflowsApi: {
    resumeChat: vi.fn().mockResolvedValue(undefined),
    decideApproval: vi.fn().mockResolvedValue({ runId: 'r1' }),
  },
}));

import type { WorkflowApprovalRow } from '@/modules/agent/workflows/api/schemas.ts';
import { workflowsApi } from '@/modules/agent/workflows/api/workflows.ts';
import { HitlCardHost } from '@/modules/agent/workflows/components/hitl-card-host.tsx';

const agenticRow: WorkflowApprovalRow = {
  approvalId: 'a1',
  runId: 'run1',
  stepId: 'chat-hitl',
  proposedPayload: {
    toolCallId: 'staffing-orchestrator:t1',
    intent: 'Assign "Infra"',
    riskBadge: 'write',
    summary: 'Top match: Alice.',
    details: [
      {
        kind: 'entityList',
        select: 'multi',
        items: [
          {
            id: 'u1',
            type: 'user',
            label: 'Alice',
            secondary: 'skills: aws · available',
            score: 0.9,
            primary: true,
          },
        ],
      },
      { kind: 'confidence', score: 0.9 },
    ],
    primary: {
      label: 'Assign to Alice',
      argsPatch: { action: 'assign', assigneeUserIds: ['u1'], taskId: 't1' },
    },
    alternates: [],
    decline: { label: 'Leave unassigned' },
    meta: {
      tenantId: 'tn',
      userId: 'actor',
      agentPath: ['staffing', 'orchestrator'],
      toolId: 'planner_proposeAssignment',
      ts: '2026-06-11T00:00:00Z',
    },
  },
  approverUserId: 'actor',
  surfaceCanvas: false,
  surfaceChatThreadId: 'thread-1',
  status: 'pending',
  decisionPayload: null,
  decidedAt: null,
  expiresAt: '2999-01-01T00:00:00Z',
  createdAt: '2026-06-11T00:00:00Z',
  agentic: true,
};

function wrap(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('HitlCardHost', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the candidate via the user entity renderer', () => {
    wrap(<HitlCardHost approval={agenticRow} canAct threadId="thread-1" />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('routes an agentic approve to /chat/resume', async () => {
    wrap(<HitlCardHost approval={agenticRow} canAct threadId="thread-1" />);
    await userEvent.click(screen.getByRole('button', { name: /assign to alice/i }));
    await waitFor(() => expect(workflowsApi.resumeChat).toHaveBeenCalled());
    expect(workflowsApi.resumeChat).toHaveBeenCalledWith(
      expect.objectContaining({ approvalId: 'a1', decision: 'approve', overrideUserIds: ['u1'] }),
    );
    expect(workflowsApi.decideApproval).not.toHaveBeenCalled();
  });
});
