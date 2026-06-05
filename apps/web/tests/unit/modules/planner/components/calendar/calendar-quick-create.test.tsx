import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CalendarQuickCreate } from '../../../../../../src/modules/planner/components/calendar/calendar-quick-create';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

describe('CalendarQuickCreate', () => {
  it('creates a task with the clicked date as due_at and closes on success', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/planner/v1/tasks', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'new1', title: 'Demo', version: 1 }, { status: 201 });
      }),
    );

    const onClose = vi.fn();
    render(wrap(<CalendarQuickCreate planId="p1" dueDate="2026-06-12" onClose={onClose} />));

    await userEvent.type(screen.getByLabelText('Task title'), 'Demo');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(body).toMatchObject({
      plan_id: 'p1',
      title: 'Demo',
      due_at: '2026-06-12T23:59:59.999Z',
    });
  });

  it('disables Create for empty titles', () => {
    render(wrap(<CalendarQuickCreate planId="p1" dueDate="2026-06-12" onClose={() => {}} />));
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('calls onClose when Escape is pressed in the title input', async () => {
    const onClose = vi.fn();
    render(wrap(<CalendarQuickCreate planId="p1" dueDate="2026-06-12" onClose={onClose} />));
    await userEvent.type(screen.getByLabelText('Task title'), '{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
