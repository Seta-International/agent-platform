import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PlanCalendarPage } from '../../../../../src/modules/planner/pages/plan-calendar-page';
import { EMPTY_FILTERS } from '../../../../../src/modules/planner/state/url-state';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

function makeTask(id: string, title: string, due_at: string | null) {
  return {
    id,
    title,
    due_at,
    start_at: null,
    assignees: [],
    labels: [],
    skill_tags: [],
    checklist_summary: { total: 0, checked: 0 },
    checklist_preview: [],
    reference_preview: [],
    external_source: 'native',
    sync_status: 'idle',
    priority_number: 5,
  };
}

const baseProps = {
  planId: 'p1',
  calFrom: '2026-06-01',
  calTo: '2026-06-30',
  calPage: 1,
  filters: EMPTY_FILTERS,
  q: '',
  onRangeChange: vi.fn(),
  onPageChange: vi.fn(),
  onOpenTask: vi.fn(),
  onSwitchToBoard: vi.fn(),
};

describe('PlanCalendarPage', () => {
  it('pushes the current month into the URL when range params are missing (AC-8)', () => {
    const onRangeChange = vi.fn();
    render(
      wrap(
        <PlanCalendarPage
          {...baseProps}
          calFrom={undefined}
          calTo={undefined}
          onRangeChange={onRangeChange}
        />,
      ),
    );
    expect(onRangeChange).toHaveBeenCalledTimes(1);
    const [from, to, opts] = onRangeChange.mock.calls[0]!;
    expect(from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(opts).toEqual({ replace: true });
  });

  it('renders fetched tasks and opens a task on click (AC-1)', async () => {
    server.use(
      http.get('/api/planner/v1/plans/p1/tasks/calendar', () =>
        HttpResponse.json({
          tasks: [makeTask('t1', 'Ship calendar', '2026-06-10T00:00:00Z')],
          total_count: 1,
        }),
      ),
    );
    const onOpenTask = vi.fn();
    render(wrap(<PlanCalendarPage {...baseProps} onOpenTask={onOpenTask} />));

    const pill = await screen.findByText('Ship calendar');
    await userEvent.click(pill);
    expect(onOpenTask).toHaveBeenCalledWith('t1');
  });

  it('shows the empty state when no tasks match (AC-10)', async () => {
    server.use(
      http.get('/api/planner/v1/plans/p1/tasks/calendar', () =>
        HttpResponse.json({ tasks: [], total_count: 0 }),
      ),
    );
    render(wrap(<PlanCalendarPage {...baseProps} />));
    expect(await screen.findByText('No tasks scheduled in this range')).toBeInTheDocument();
  });

  it('paginates without touching the range (AC-7, AC-8)', async () => {
    server.use(
      http.get('/api/planner/v1/plans/p1/tasks/calendar', () =>
        HttpResponse.json({
          tasks: Array.from({ length: 50 }, (_, i) =>
            makeTask(`t${i}`, `Task ${i}`, '2026-06-10T00:00:00Z'),
          ),
          next_cursor: 'c1',
          total_count: 60,
        }),
      ),
    );
    const onPageChange = vi.fn();
    const onRangeChange = vi.fn();
    render(
      wrap(
        <PlanCalendarPage
          {...baseProps}
          onPageChange={onPageChange}
          onRangeChange={onRangeChange}
        />,
      ),
    );

    await screen.findByTestId('calendar-pagination');
    await userEvent.click(screen.getByLabelText('Next page'));
    expect(onPageChange).toHaveBeenCalledWith(2);
    expect(onRangeChange).not.toHaveBeenCalled();
  });

  it('applies board filters and search client-side', async () => {
    server.use(
      http.get('/api/planner/v1/plans/p1/tasks/calendar', () =>
        HttpResponse.json({
          tasks: [
            makeTask('t1', 'Alpha', '2026-06-10T00:00:00Z'),
            makeTask('t2', 'Beta', '2026-06-11T00:00:00Z'),
          ],
          total_count: 2,
        }),
      ),
    );
    render(wrap(<PlanCalendarPage {...baseProps} q="alp" />));
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Beta')).not.toBeInTheDocument());
  });
});
