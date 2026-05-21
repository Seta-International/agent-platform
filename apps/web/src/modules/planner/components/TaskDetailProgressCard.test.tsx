import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeTaskWithAssignees } from '../testing/fixtures';
import { TaskDetailProgressCard } from './TaskDetailProgressCard';

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

describe('TaskDetailProgressCard', () => {
  it('renders the Progress label and the percent_complete value', () => {
    const task = makeTaskWithAssignees({ id: 't1', percent_complete: 42 });
    renderWithClient(<TaskDetailProgressCard task={task} planId="p1" />);
    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('sends percent_complete only (no progress enum) when the slider changes', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const captured = vi.fn<(body: Record<string, unknown>) => void>();
    server.use(
      http.patch('/api/planner/v1/tasks/t1', async ({ request }) => {
        captured((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ id: 't1', version: 4 });
      }),
    );

    const task = makeTaskWithAssignees({ id: 't1', percent_complete: 0, version: 3 });
    renderWithClient(<TaskDetailProgressCard task={task} planId="p1" />);
    const slider = screen.getByRole('slider', { name: /Percent complete/i });
    slider.focus();
    await user.keyboard('{ArrowRight}');

    const body = captured.mock.calls[0]?.[0] as { patch: Record<string, unknown> };
    expect(body.patch).toHaveProperty('percent_complete');
    expect(body.patch).not.toHaveProperty('progress');
  });

  it('sends is_deferred when the deferred toggle flips', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const captured = vi.fn<(body: Record<string, unknown>) => void>();
    server.use(
      http.patch('/api/planner/v1/tasks/t1', async ({ request }) => {
        captured((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ id: 't1', version: 4 });
      }),
    );

    const task = makeTaskWithAssignees({ id: 't1', is_deferred: false, version: 3 });
    renderWithClient(<TaskDetailProgressCard task={task} planId="p1" />);
    await user.click(screen.getByRole('switch', { name: /Deferred/i }));

    const body = captured.mock.calls[0]?.[0] as { patch: Record<string, unknown> };
    expect(body.patch).toEqual({ is_deferred: true });
  });
});
