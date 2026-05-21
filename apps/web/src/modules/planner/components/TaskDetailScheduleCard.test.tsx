import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeTaskWithAssignees } from '../testing/fixtures';
import { TaskDetailScheduleCard } from './TaskDetailScheduleCard';

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

describe('TaskDetailScheduleCard', () => {
  it('renders Start and Due date pills bound to task values', () => {
    const task = makeTaskWithAssignees({
      id: 't1',
      start_at: '2026-08-10',
      due_at: '2026-08-17',
    });
    renderWithClient(<TaskDetailScheduleCard task={task} planId="p1" />);
    expect(screen.getByLabelText('Start')).toHaveValue('2026-08-10');
    expect(screen.getByLabelText('Due')).toHaveValue('2026-08-17');
  });

  it('renders a summary line with day-range and ISO week', () => {
    const task = makeTaskWithAssignees({
      id: 't1',
      start_at: '2026-08-10',
      due_at: '2026-08-17',
    });
    renderWithClient(<TaskDetailScheduleCard task={task} planId="p1" />);
    expect(screen.getByText(/8-day range/)).toBeInTheDocument();
    expect(screen.getByText(/week/)).toBeInTheDocument();
  });

  it('renders a MiniGantt when both dates are set', () => {
    const task = makeTaskWithAssignees({
      id: 't1',
      start_at: '2026-08-10',
      due_at: '2026-08-17',
    });
    renderWithClient(<TaskDetailScheduleCard task={task} planId="p1" />);
    expect(screen.getByRole('img', { name: /Schedule/ })).toBeInTheDocument();
  });

  it('sends start_at on change', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const captured = vi.fn<(body: Record<string, unknown>) => void>();
    server.use(
      http.patch('/api/planner/v1/tasks/t1', async ({ request }) => {
        captured((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ id: 't1', version: 4 });
      }),
    );

    const task = makeTaskWithAssignees({ id: 't1', version: 3 });
    renderWithClient(<TaskDetailScheduleCard task={task} planId="p1" />);
    const start = screen.getByLabelText('Start');
    await user.type(start, '2026-09-01');

    const body = captured.mock.calls.at(-1)?.[0] as { patch: Record<string, unknown> };
    expect(body.patch).toHaveProperty('start_at');
  });
});
