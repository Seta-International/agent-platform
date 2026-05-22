import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('replay-from-step mode renders a banner and routes submit through replayFromStep', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('input-schema')) {
        return new Response(JSON.stringify(SCHEMA), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (u.includes('replay-from-step')) {
        return new Response(JSON.stringify({ newRunId: 'replay-run' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error('unexpected fetch ' + u);
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    render(
      withQuery(
        <RerunSideSheet
          open
          mode="replay-from-step"
          replayContext={{
            stepId: 'step-b',
            originalPayload: { taskRef: { taskId: '11111111-1111-1111-1111-111111111111' } },
          }}
          runId="r1"
          workflowId="copilot.x"
          priorInputSummary={{ taskRef: { taskId: '11111111-1111-1111-1111-111111111111' } }}
          onClose={vi.fn()}
        />,
      ),
    );

    await waitFor(() => expect(screen.getByText(/replaying from step/i)).toBeInTheDocument());
    expect(screen.getByText('step-b')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /replay from step/i })).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Replay from step' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Replay from step' }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit | undefined]>;
      const replayCall = calls.find(([u]) => String(u).includes('replay-from-step'));
      expect(replayCall).toBeDefined();
      const body = JSON.parse(String(replayCall?.[1]?.body));
      expect(body.stepId).toBe('step-b');
      expect(body.payload).toEqual({
        taskRef: { taskId: '11111111-1111-1111-1111-111111111111' },
      });
    });
  });
});
