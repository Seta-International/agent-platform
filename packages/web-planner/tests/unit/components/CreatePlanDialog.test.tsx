import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
  // Astryx's real Dialog always mounts <dialog> + children regardless of `isOpen` — it does
  // not unmount on close. purpose="form" renders role="dialog" (only purpose="required" maps
  // to role="alertdialog"). DialogHeader doesn't wire aria-labelledby, so the dialog has no
  // computed accessible name — assert the title via its heading instead.
  it('exposes an accessible dialog with heading "New plan" when open', () => {
    wrap(<CreatePlanDialog groupId="g-1" open onOpenChange={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'New plan' })).toBeInTheDocument();
  });

  it('is not exposed as a dialog when closed', () => {
    wrap(<CreatePlanDialog groupId="g-1" open={false} onOpenChange={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes via the header close button', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    wrap(<CreatePlanDialog groupId="g-1" open onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

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
