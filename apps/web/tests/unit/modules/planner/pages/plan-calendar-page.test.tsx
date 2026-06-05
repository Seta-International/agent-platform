import type { TaskWithAssigneesRow } from '@seta/planner';
import { toast } from '@seta/shared-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PlanCalendarPage } from '../../../../../src/modules/planner/pages/plan-calendar-page';
import { EMPTY_FILTERS } from '../../../../../src/modules/planner/state/url-state';

// Mock CalendarGrid to avoid FC/jsdom incompatibility.
// Each test can read .mock.lastCall![0] to access the props passed to it.
type CalendarGridProps = {
  tasks: TaskWithAssigneesRow[];
  from: string;
  to: string;
  onOpenTask: (taskId: string) => void;
  onRescheduleTask: (
    task: TaskWithAssigneesRow,
    newStart: Date | null,
    newEnd: Date | null,
    revert: () => void,
  ) => Promise<void>;
  onSelectDate?: (dateKey: string) => void;
};
const mockCalendarGrid = vi.hoisted(() =>
  vi.fn((_props: CalendarGridProps) => <div data-testid="calendar-grid" />),
);
vi.mock('../../../../../src/modules/planner/components/calendar/calendar-grid', () => ({
  CalendarGrid: mockCalendarGrid,
}));

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

  it('renders fetched tasks via CalendarGrid (AC-1)', async () => {
    server.use(
      http.get('/api/planner/v1/plans/p1/tasks/calendar', () =>
        HttpResponse.json({
          tasks: [makeTask('t1', 'Ship calendar', '2026-06-10T00:00:00Z')],
          total_count: 1,
        }),
      ),
    );
    render(wrap(<PlanCalendarPage {...baseProps} />));
    await screen.findByTestId('calendar-grid');
  });

  it('shows the calendar grid even when no tasks match (AC-10)', async () => {
    server.use(
      http.get('/api/planner/v1/plans/p1/tasks/calendar', () =>
        HttpResponse.json({ tasks: [], total_count: 0 }),
      ),
    );
    render(wrap(<PlanCalendarPage {...baseProps} />));
    expect(await screen.findByTestId('calendar-grid')).toBeInTheDocument();
    expect(screen.queryByText('No tasks scheduled in this range')).not.toBeInTheDocument();
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
    expect(await screen.findByTestId('calendar-grid')).toBeInTheDocument();
  });

  it('renders the CalendarGrid with fetched tasks', async () => {
    server.use(
      http.get('/api/planner/v1/plans/p1/tasks/calendar', () =>
        HttpResponse.json({
          tasks: [makeTask('t1', 'Ship calendar', '2026-06-10T00:00:00Z')],
          total_count: 1,
        }),
      ),
    );
    render(wrap(<PlanCalendarPage {...baseProps} />));
    await screen.findByTestId('calendar-grid');
    const { tasks } = mockCalendarGrid.mock.lastCall![0];
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.id).toBe('t1');
  });

  it('patches due_at without adding start_at on a due-only task', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/planner/v1/plans/p1/tasks/calendar', () =>
        HttpResponse.json({
          tasks: [makeTask('t1', 'Ship calendar', '2026-06-10T00:00:00Z')],
          total_count: 1,
        }),
      ),
      http.patch('/api/planner/v1/tasks/t1', async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 't1', version: 2, due_at: '2026-06-20T00:00:00.000Z' });
      }),
    );

    render(wrap(<PlanCalendarPage {...baseProps} />));
    await screen.findByTestId('calendar-grid');

    const { onRescheduleTask } = mockCalendarGrid.mock.lastCall![0];
    // FC delivers local-midnight Dates; these happen to be UTC midnight in test env.
    await act(async () => {
      await onRescheduleTask(
        makeTask('t1', 'Ship calendar', '2026-06-10T00:00:00Z') as unknown as TaskWithAssigneesRow,
        new Date('2026-06-20T00:00:00Z'),
        new Date('2026-06-21T00:00:00Z'),
        vi.fn(),
      );
    });

    const patch = (capturedBody as Record<string, unknown> | null)?.patch as
      | Record<string, unknown>
      | undefined;
    expect(patch?.due_at).toBe('2026-06-20T00:00:00.000Z');
    // Due-only task: start_at must not be silently added.
    expect(patch?.start_at).toBeNull();
  });

  it('calls revert and shows a toast when reschedule fails', async () => {
    server.use(
      http.get('/api/planner/v1/plans/p1/tasks/calendar', () =>
        HttpResponse.json({
          tasks: [makeTask('t1', 'Ship calendar', '2026-06-10T00:00:00Z')],
          total_count: 1,
        }),
      ),
      http.patch('/api/planner/v1/tasks/t1', () => new HttpResponse(null, { status: 500 })),
    );
    const toastErrorSpy = vi
      .spyOn(toast, 'error')
      .mockReturnValue('id' as ReturnType<typeof toast.error>);

    render(wrap(<PlanCalendarPage {...baseProps} />));
    await screen.findByTestId('calendar-grid');

    const { onRescheduleTask } = mockCalendarGrid.mock.lastCall![0];
    const revert = vi.fn();
    await act(async () => {
      await onRescheduleTask(
        { id: 't1', version: 1 } as TaskWithAssigneesRow,
        new Date('2026-06-15T00:00:00Z'),
        new Date('2026-06-16T00:00:00Z'),
        revert,
      );
    });

    expect(revert).toHaveBeenCalledOnce();
    expect(toastErrorSpy).toHaveBeenCalledWith('Failed to reschedule task. Please try again.');
    toastErrorSpy.mockRestore();
  });
});
