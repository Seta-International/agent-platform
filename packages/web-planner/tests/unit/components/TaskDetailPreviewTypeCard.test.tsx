import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TaskDetailPreviewTypeCard } from '../../../src/components/TaskDetailPreviewTypeCard';
import { makeTaskWithAssignees } from '../../../src/testing/fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderWithClient(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('TaskDetailPreviewTypeCard', () => {
  it('renders the five options with the current value pre-selected', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const task = makeTaskWithAssignees({ id: 't1', preview_type: 'checklist' });
    renderWithClient(<TaskDetailPreviewTypeCard task={task} planId="p1" />);
    // "Show on card" appears twice now: the section header and the Selector's
    // visually-hidden accessible label.
    expect(screen.getAllByText('Show on card').length).toBeGreaterThan(0);
    // Astryx Selector: the trigger is a button named by its (hidden) label and
    // shows the current option's label.
    const trigger = screen.getByRole('combobox', { name: /show on card/i });
    expect(trigger).toHaveTextContent('Checklist');
    // Opening the dropdown reveals all five options.
    await user.click(trigger);
    expect(await screen.findByRole('option', { name: /Automatic/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /None/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Checklist/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Description/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Reference/ })).toBeInTheDocument();
  });

  it('sends preview_type when an option is selected', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const captured = vi.fn<(body: Record<string, unknown>) => void>();
    server.use(
      http.patch('/api/planner/v1/tasks/t1', async ({ request }) => {
        captured((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ id: 't1', version: 4 });
      }),
    );

    const task = makeTaskWithAssignees({ id: 't1', preview_type: 'automatic', version: 3 });
    renderWithClient(<TaskDetailPreviewTypeCard task={task} planId="p1" />);
    await user.click(screen.getByRole('combobox', { name: /show on card/i }));
    await user.click(await screen.findByRole('option', { name: /Reference/ }));

    expect(captured.mock.calls[0]?.[0]).toEqual({
      expected_version: 3,
      patch: { preview_type: 'reference' },
    });
  });
});
