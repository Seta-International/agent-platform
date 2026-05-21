import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeTaskWithAssignees } from '../testing/fixtures';
import { TaskDetailDescriptionCard } from './TaskDetailDescriptionCard';

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

describe('TaskDetailDescriptionCard', () => {
  it('renders the markdown view when description is non-empty', () => {
    const task = makeTaskWithAssignees({ id: 't1', description: 'Hello **world**' });
    renderWithClient(<TaskDetailDescriptionCard task={task} planId="p1" />);
    expect(screen.getByText('world')).toBeInTheDocument();
  });

  it('renders a "no description" placeholder when description is null', () => {
    const task = makeTaskWithAssignees({ id: 't1', description: null });
    renderWithClient(<TaskDetailDescriptionCard task={task} planId="p1" />);
    expect(screen.getByText(/no description/i)).toBeInTheDocument();
  });

  it('switches to a textarea when the view area is clicked, and Save calls updateTask', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const captured = vi.fn<(body: Record<string, unknown>) => void>();
    server.use(
      http.patch('/api/planner/v1/tasks/t1', async ({ request }) => {
        captured((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ id: 't1', version: 4, description: 'New body' });
      }),
    );

    const task = makeTaskWithAssignees({ id: 't1', description: 'Old', version: 3 });
    renderWithClient(<TaskDetailDescriptionCard task={task} planId="p1" />);

    await user.click(screen.getByRole('button', { name: /Edit description/i }));
    const ta = screen.getByRole('textbox', { name: /Description/i });
    await user.clear(ta);
    await user.type(ta, 'New body');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    expect(captured.mock.calls[0]?.[0]).toEqual({
      expected_version: 3,
      patch: { description: 'New body' },
    });
  });

  it('cancels editing on Esc', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const task = makeTaskWithAssignees({ id: 't1', description: 'Original', version: 3 });
    renderWithClient(<TaskDetailDescriptionCard task={task} planId="p1" />);

    await user.click(screen.getByRole('button', { name: /Edit description/i }));
    const ta = screen.getByRole('textbox', { name: /Description/i });
    await user.clear(ta);
    await user.type(ta, 'Drafted text');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('textbox', { name: /Description/i })).not.toBeInTheDocument();
    expect(screen.getByText('Original')).toBeInTheDocument();
  });
});
