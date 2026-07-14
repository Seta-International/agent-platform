import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TaskDetailScheduleCard } from '../../../src/components/TaskDetailScheduleCard';
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

// Astryx DateInput (packages/shared-ui/src/primitives/date-input.tsx) renders a formatted
// text input (role="combobox"), not a native <input type="date"> — its DOM `.value` is a
// localized "Month D, YYYY" string, not the ISO value the component takes/emits. Mirror its
// internal formatting (DateInput -> plainDateToDate + DATE_FORMAT_LONG, both local-time based)
// so assertions on displayed text stay correct regardless of machine locale/timezone.
function formatLongDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(year, month - 1, day));
}

describe('TaskDetailScheduleCard', () => {
  it('renders Start and Due date pills bound to task values', () => {
    const task = makeTaskWithAssignees({
      id: 't1',
      start_at: '2026-08-10',
      due_at: '2026-08-17',
    });
    renderWithClient(<TaskDetailScheduleCard task={task} planId="p1" />);
    expect(screen.getByLabelText('Start')).toHaveValue(formatLongDate('2026-08-10'));
    expect(screen.getByLabelText('Due')).toHaveValue(formatLongDate('2026-08-17'));
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
