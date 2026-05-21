import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

import { RerunSideSheet } from './rerun-side-sheet.tsx';

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

describe('RerunSideSheet', () => {
  it('renders nothing when closed', () => {
    render(
      withQuery(
        <RerunSideSheet
          open={false}
          runId="r1"
          workflowId="copilot.x"
          priorInputSummary={{}}
          onClose={vi.fn()}
        />,
      ),
    );
    expect(screen.queryByText(/re-run workflow/i)).not.toBeInTheDocument();
  });

  it('renders the form once schema loads and pre-fills defaults from priorInputSummary', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('input-schema')) {
        return new Response(JSON.stringify(SCHEMA), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error('unexpected fetch ' + url);
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    render(
      withQuery(
        <RerunSideSheet
          open
          runId="r1"
          workflowId="copilot.x"
          priorInputSummary={{ taskRef: { taskId: '11111111-1111-1111-1111-111111111111' } }}
          onClose={vi.fn()}
        />,
      ),
    );

    await waitFor(() => expect(screen.getByLabelText('taskRef › taskId')).toBeInTheDocument());
    expect((screen.getByLabelText('taskRef › taskId') as HTMLInputElement).value).toBe(
      '11111111-1111-1111-1111-111111111111',
    );
    expect(screen.getByRole('heading', { name: /re-run workflow/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-run' })).toBeInTheDocument();
  });
});
