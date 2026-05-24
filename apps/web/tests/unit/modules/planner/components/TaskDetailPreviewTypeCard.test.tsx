import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TaskDetailPreviewTypeCard } from '../../../../../src/modules/planner/components/TaskDetailPreviewTypeCard';
import { makeTaskWithAssignees } from '../../../../../src/modules/planner/testing/fixtures';

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
    expect(screen.getByText('Preview')).toBeInTheDocument();
    // Trigger shows the current option's label.
    const trigger = screen.getByRole('button', { name: 'Preview type' });
    expect(trigger).toHaveTextContent('Checklist');
    // Opening the dropdown reveals all five options as menu items.
    await user.click(trigger);
    expect(await screen.findByRole('menuitem', { name: /Automatic/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /None/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Checklist/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Description/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Reference/ })).toBeInTheDocument();
  });

  it('sends preview_type when an option is clicked', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Preview type' }));
    await user.click(await screen.findByRole('menuitem', { name: /Reference/ }));

    expect(captured.mock.calls[0]?.[0]).toEqual({
      expected_version: 3,
      patch: { preview_type: 'reference' },
    });
  });
});
