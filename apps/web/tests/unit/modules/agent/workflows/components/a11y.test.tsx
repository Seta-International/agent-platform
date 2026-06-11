import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowApprovalRow } from '@/modules/agent/workflows/api/schemas.ts';
import { HitlApprovalCard } from '@/modules/agent/workflows/components/hitl-approval-card.tsx';
import { InputFormFromSchema } from '@/modules/agent/workflows/components/input-form-from-schema.tsx';
import { RunStatusPill } from '@/modules/agent/workflows/components/run-status-pill.tsx';

expect.extend(toHaveNoViolations);

const APPROVAL: WorkflowApprovalRow = {
  approvalId: 'a1',
  runId: 'r1',
  stepId: 'await-approval',
  proposedPayload: { displayName: 'Jane', userId: 'u-9', rationale: 'top match' },
  approverUserId: 'u-1',
  surfaceCanvas: true,
  surfaceChatThreadId: null,
  agentic: false,
  status: 'pending',
  decisionPayload: null,
  decidedAt: null,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  createdAt: new Date().toISOString(),
};

const SCHEMA = {
  type: 'object',
  properties: {
    taskRef: {
      type: 'object',
      properties: { taskId: { type: 'string', format: 'uuid' } },
      required: ['taskId'],
    },
  },
} as const;

function withQuery(children: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('workflow surfaces — axe', () => {
  it('RunStatusPill has no a11y violations across all statuses', async () => {
    const { container } = render(
      <ul>
        {(
          ['pending', 'running', 'paused', 'success', 'failed', 'tripwire', 'canceled'] as const
        ).map((s) => (
          <li key={s}>
            <RunStatusPill status={s} />
          </li>
        ))}
      </ul>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('HitlApprovalCard has no a11y violations', async () => {
    const { container } = render(
      <HitlApprovalCard approval={APPROVAL} canAct onDecide={vi.fn()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('InputFormFromSchema has no a11y violations', async () => {
    const { container } = render(
      withQuery(
        <InputFormFromSchema
          schema={SCHEMA as unknown as Record<string, unknown>}
          defaults={{ taskRef: { taskId: '11111111-1111-1111-1111-111111111111' } }}
          onSubmit={vi.fn()}
        />,
      ),
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
