import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeTaskWithAssignees } from '../testing/fixtures';
import { TaskDetailPriorityCard } from './TaskDetailPriorityCard';

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

describe('TaskDetailPriorityCard', () => {
  it('renders the Priority label and the four stops with active selection', () => {
    const task = makeTaskWithAssignees({ id: 't1', priority_number: 3 });
    renderWithClient(<TaskDetailPriorityCard task={task} planId="p1" />);
    expect(screen.getByText('Priority')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Important', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Urgent', pressed: false })).toBeInTheDocument();
  });

  it('sends priority_number only (no priority enum) when a stop is clicked', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const captured = vi.fn<(body: Record<string, unknown>) => void>();
    server.use(
      http.patch('/api/planner/v1/tasks/t1', async ({ request }) => {
        captured((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ id: 't1', version: 4 });
      }),
    );

    const task = makeTaskWithAssignees({ id: 't1', priority_number: 5, version: 3 });
    renderWithClient(<TaskDetailPriorityCard task={task} planId="p1" />);
    await user.click(screen.getByRole('button', { name: 'Urgent' }));

    const body = captured.mock.calls[0]?.[0] as { patch: Record<string, unknown> };
    expect(body.patch).toEqual({ priority_number: 1 });
    expect(body.patch).not.toHaveProperty('priority');
  });
});
