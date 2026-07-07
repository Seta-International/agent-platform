import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CreatePlanDialog } from '../../../src/components/CreatePlanDialog';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('CreatePlanDialog', () => {
  it('submits the typed name on Enter', async () => {
    const user = userEvent.setup();
    const captured: unknown[] = [];
    server.use(
      http.post('*/api/planner/v1/plans', async ({ request }) => {
        captured.push(await request.json());
        return HttpResponse.json(
          { id: 'p-1', group_id: 'g-1', name: 'Q3 Launch' },
          { status: 201 },
        );
      }),
    );
    wrap(<CreatePlanDialog groupId="g-1" open onOpenChange={() => {}} />);
    await user.type(screen.getByLabelText(/Name/i), 'Q3 Launch');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(captured.length).toBe(1));
    expect(captured[0]).toMatchObject({ group_id: 'g-1', name: 'Q3 Launch' });
  });

  it('does not create a second plan when Enter fires again before the first submission resolves (FUT-390)', async () => {
    const user = userEvent.setup();
    const captured: unknown[] = [];
    let releaseResponse!: () => void;
    const held = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    server.use(
      http.post('*/api/planner/v1/plans', async ({ request }) => {
        captured.push(await request.json());
        await held;
        return HttpResponse.json(
          { id: 'p-1', group_id: 'g-1', name: 'Q3 Launch' },
          { status: 201 },
        );
      }),
    );
    wrap(<CreatePlanDialog groupId="g-1" open onOpenChange={() => {}} />);
    await user.type(screen.getByLabelText(/Name/i), 'Q3 Launch');
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');
    releaseResponse();
    await waitFor(() => expect(captured.length).toBeGreaterThan(0));
    // Give any errant second request a chance to land before asserting.
    await new Promise((r) => setTimeout(r, 20));
    expect(captured).toHaveLength(1);
  });
});
