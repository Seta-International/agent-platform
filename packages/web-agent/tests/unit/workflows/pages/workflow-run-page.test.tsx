import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowRunRow } from '../../../../src/workflows/api/schemas.ts';

// EventSource is not available in happy-dom (useWorkflowRun opens a live stream).
class MockEventSource {
  addEventListener() {}
  close() {}
}
vi.stubGlobal('EventSource', MockEventSource);

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

// The graph/right-panel pull in ReactFlow and heavy detail rendering that's out of scope
// for a frame-only migration test — stub them so this file stays focused on the
// breadcrumb/title contract the Astryx migration actually touches.
vi.mock('../../../../src/workflows/components/workflow-graph.tsx', () => ({
  WorkflowGraph: () => <div data-testid="workflow-graph-stub" />,
}));
vi.mock('../../../../src/workflows/components/run-right-panel.tsx', () => ({
  RunRightPanel: () => <div data-testid="run-right-panel-stub" />,
}));

const getRun = vi.fn();
vi.mock('../../../../src/workflows/api/workflows.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/workflows/api/workflows.ts')>();
  return {
    ...actual,
    workflowsApi: {
      ...actual.workflowsApi,
      getRun: (runId: string) => getRun(runId),
      getRunSnapshot: () => Promise.resolve(null),
      listMyPendingApprovals: () => Promise.resolve([]),
      issueSseToken: () => Promise.reject(new Error('not used in test')),
    },
  };
});

import { WorkflowRunPage } from '../../../../src/workflows/pages/workflow-run-page.tsx';

const RUN: WorkflowRunRow = {
  runId: 'run-1234567890',
  workflowId: 'agent.dedupCandidates',
  tenantId: 't-1',
  startedBy: 'u-1',
  startedVia: 'manual',
  status: 'success',
  suspendReason: null,
  errorSummary: null,
  inputSummary: {},
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  durationMs: 1000,
  latestApprovalKind: null,
  latestApprovalReason: null,
};

function renderPage(runId = 'run-1234567890') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <WorkflowRunPage runId={runId} />
    </QueryClientProvider>,
  );
}

describe('WorkflowRunPage — breadcrumb trail (Astryx migration)', () => {
  afterEach(() => {
    getRun.mockReset();
  });

  it('renders the loading-state trail before the run resolves', () => {
    getRun.mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByRole('link', { name: 'Agent Studio' })).toHaveAttribute(
      'href',
      '/agent',
    );
    expect(within(nav).getByRole('link', { name: 'Workflows' })).toHaveAttribute(
      'href',
      '/agent/workflows',
    );
    expect(within(nav).getByText('Loading run…').closest('a')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Loading run…' })).toBeInTheDocument();
  });

  it('renders the not-found trail when the run is missing', async () => {
    getRun.mockResolvedValue(null);
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Run not found' });
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByRole('link', { name: 'Workflows' })).toHaveAttribute(
      'href',
      '/agent/workflows',
    );
    expect(within(nav).getByText('Run not found').closest('a')).toBeNull();
  });

  it('renders the run-label current crumb once the run loads, same trail shape', async () => {
    getRun.mockResolvedValue(RUN);
    renderPage();

    // workflowLabel strips everything up to and including the last '.'.
    await screen.findByRole('heading', { level: 1, name: 'dedupCandidates' });

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByRole('link', { name: 'Agent Studio' })).toHaveAttribute(
      'href',
      '/agent',
    );
    expect(within(nav).getByRole('link', { name: 'Workflows' })).toHaveAttribute(
      'href',
      '/agent/workflows',
    );
    // Current crumb is the plain run label — not the mono-styled JSX — and not a link.
    expect(within(nav).getByText('dedupCandidates').closest('a')).toBeNull();
  });
});
