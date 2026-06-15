import type { MyTasksResult, TaskWithPlan } from '@seta/planner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { findNeighbors } from '../../../../../src/modules/planner/lib/my-tasks-sections';
import { MyTasksPage } from '../../../../../src/modules/planner/pages/my-tasks-page';
import type { MyTasksFilters } from '../../../../../src/modules/planner/state/query-keys';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

function emptyResult(): MyTasksResult {
  return { late: [], dueThisWeek: [], inProgress: [], notStarted: [], recentlyCompleted: [] };
}

function fxTask(over: Partial<TaskWithPlan> = {}): TaskWithPlan {
  return {
    id: 't1',
    tenant_id: 't',
    plan_id: 'p-q3',
    bucket_id: null,
    title: 'Task',
    description: null,
    description_text: null,
    priority_number: 5,
    percent_complete: 0,
    is_deferred: false,
    preview_type: 'automatic',
    review_state: null,
    start_at: null,
    due_at: null,
    order_hint: null,
    assignee_priority: 'a0',
    external_source: 'native',
    external_id: null,
    external_etag: null,
    external_synced_at: null,
    sync_status: 'idle',
    last_error: null,
    created_by: 'u',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    version: 1,
    plan: { id: 'p-q3', name: 'Q3 Launch', group_id: 'g1' },
    assignees: [],
    labels: [],
    ...over,
  };
}

function renderPage(initialFilters: MyTasksFilters = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  let filters = initialFilters;
  const setFilters = vi.fn((next: MyTasksFilters) => {
    filters = next;
  });
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/planner/my-tasks',
    component: function PageCmp() {
      return (
        <MyTasksPage
          filters={filters}
          onFiltersChange={(n) => {
            setFilters(n);
          }}
        />
      );
    },
  });
  const taskRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/planner/plans/$planId/tasks/$taskId',
    component: () => <div data-testid="task-detail-stub" />,
  });
  const planRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/planner/plans/$planId',
    component: () => <div data-testid="plan-stub" />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute, taskRoute, planRoute]),
    history: createMemoryHistory({ initialEntries: ['/planner/my-tasks'] }),
  });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, setFilters };
}

describe('findNeighbors', () => {
  it('drag forward (src=0 → dest=2) excludes the dragged task before indexing', () => {
    const data = {
      ...emptyResult(),
      late: [
        fxTask({
          id: 'A',
          plan_id: 'p',
          assignee_priority: 'a',
          plan: { id: 'p', name: 'P', group_id: 'g' },
        }),
        fxTask({
          id: 'B',
          plan_id: 'p',
          assignee_priority: 'b',
          plan: { id: 'p', name: 'P', group_id: 'g' },
        }),
        fxTask({
          id: 'C',
          plan_id: 'p',
          assignee_priority: 'c',
          plan: { id: 'p', name: 'P', group_id: 'g' },
        }),
      ],
    } as MyTasksResult;
    // After A is removed, tasks = [B, C]; destination.index=2 means after C
    expect(findNeighbors(data, 'mt:late', 'A', 2)).toEqual({ prev: 'c', next: null });
  });

  it('drag backward (src=2 → dest=0) excludes the dragged task before indexing', () => {
    const data = {
      ...emptyResult(),
      late: [
        fxTask({
          id: 'A',
          plan_id: 'p',
          assignee_priority: 'a',
          plan: { id: 'p', name: 'P', group_id: 'g' },
        }),
        fxTask({
          id: 'B',
          plan_id: 'p',
          assignee_priority: 'b',
          plan: { id: 'p', name: 'P', group_id: 'g' },
        }),
        fxTask({
          id: 'C',
          plan_id: 'p',
          assignee_priority: 'c',
          plan: { id: 'p', name: 'P', group_id: 'g' },
        }),
      ],
    } as MyTasksResult;
    // After C is removed, tasks = [A, B]; destination.index=0 means before A
    expect(findNeighbors(data, 'mt:late', 'C', 0)).toEqual({ prev: null, next: 'a' });
  });

  it('reorders across plans within the same section (MS Planner-style flat sort)', () => {
    // A (plan p1) | B (plan p2) | C (plan p1) — drag B (idx=1) to idx=0
    const data = {
      ...emptyResult(),
      late: [
        fxTask({
          id: 'A',
          plan_id: 'p1',
          assignee_priority: 'a',
          plan: { id: 'p1', name: 'P1', group_id: 'g' },
        }),
        fxTask({
          id: 'B',
          plan_id: 'p2',
          assignee_priority: 'b',
          plan: { id: 'p2', name: 'P2', group_id: 'g' },
        }),
        fxTask({
          id: 'C',
          plan_id: 'p1',
          assignee_priority: 'c',
          plan: { id: 'p1', name: 'P1', group_id: 'g' },
        }),
      ],
    } as MyTasksResult;
    // After B is removed, tasks = [A, C]; idx=0 means before A
    expect(findNeighbors(data, 'mt:late', 'B', 0)).toEqual({ prev: null, next: 'a' });
  });

  it('malformed droppableId returns null/null', () => {
    expect(findNeighbors({} as MyTasksResult, 'invalid', 't', 0)).toEqual({
      prev: null,
      next: null,
    });
  });

  it('unknown section returns null/null', () => {
    expect(findNeighbors({} as MyTasksResult, 'mt:bogus', 't', 0)).toEqual({
      prev: null,
      next: null,
    });
  });
});

describe('MyTasksPage', () => {
  it('renders the loading skeleton while data is in-flight', async () => {
    server.use(
      http.get('*/api/planner/v1/my-tasks', async () => {
        await delay(50);
        return HttpResponse.json(emptyResult());
      }),
    );
    renderPage();
    expect(await screen.findByTestId('my-tasks-skeleton')).toBeInTheDocument();
  });

  it('renders error alert with Retry on fetch failure', async () => {
    server.use(
      http.get('*/api/planner/v1/my-tasks', () =>
        HttpResponse.json({ error: 'BOOM' }, { status: 500 }),
      ),
    );
    renderPage();
    expect(await screen.findByTestId('my-tasks-error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('renders the EmptyState when every section is empty', async () => {
    server.use(http.get('*/api/planner/v1/my-tasks', () => HttpResponse.json(emptyResult())));
    renderPage();
    expect(await screen.findByText(/all caught up/i)).toBeInTheDocument();
  });

  it('renders subtitle "N open · M late · K due this week"', async () => {
    server.use(
      http.get('*/api/planner/v1/my-tasks', () =>
        HttpResponse.json({
          ...emptyResult(),
          late: [fxTask({ id: 'L1' }), fxTask({ id: 'L2' })],
          dueThisWeek: [fxTask({ id: 'W1' })],
          inProgress: [fxTask({ id: 'P1' }), fxTask({ id: 'P2' }), fxTask({ id: 'P3' })],
        }),
      ),
    );
    renderPage();
    // exact text — disambiguates the header subtitle from the new footer status bar
    expect(await screen.findByText('6 open · 2 late · 1 due this week')).toBeInTheDocument();
  });

  it('renders 5 sections in fixed order: late, week, in_progress, not_started, done', async () => {
    server.use(
      http.get('*/api/planner/v1/my-tasks', () =>
        HttpResponse.json({
          ...emptyResult(),
          late: [fxTask({ id: 'L' })],
          dueThisWeek: [fxTask({ id: 'W' })],
          inProgress: [fxTask({ id: 'P' })],
          notStarted: [fxTask({ id: 'N' })],
          recentlyCompleted: [fxTask({ id: 'D' })],
        }),
      ),
    );
    renderPage();
    await screen.findByText('Late');
    const sections = document.querySelectorAll('[data-testid="mt-section"]');
    const keys = Array.from(sections).map((s) => s.getAttribute('data-section'));
    expect(keys).toEqual(['late', 'week', 'in_progress', 'not_started', 'done']);
  });

  it('Late and Due-this-week sections are open by default; the rest collapsed', async () => {
    server.use(
      http.get('*/api/planner/v1/my-tasks', () =>
        HttpResponse.json({
          ...emptyResult(),
          late: [fxTask({ id: 'L' })],
          dueThisWeek: [fxTask({ id: 'W' })],
          inProgress: [fxTask({ id: 'P' })],
          notStarted: [fxTask({ id: 'N' })],
          recentlyCompleted: [fxTask({ id: 'D' })],
        }),
      ),
    );
    renderPage();
    await screen.findByText('Late');
    expect(screen.queryAllByText('Q3 Launch').length).toBeGreaterThanOrEqual(2);
  });

  it('Recently completed hint reads "last 14 days"', async () => {
    server.use(
      http.get('*/api/planner/v1/my-tasks', () =>
        HttpResponse.json({
          ...emptyResult(),
          late: [fxTask()],
          recentlyCompleted: [fxTask()],
        }),
      ),
    );
    renderPage();
    expect(await screen.findByText(/last 14 days/)).toBeInTheDocument();
  });

  it('clicking a row navigates to /planner/plans/$planId/tasks/$taskId (no slide-over)', async () => {
    server.use(
      http.get('*/api/planner/v1/my-tasks', () =>
        HttpResponse.json({
          ...emptyResult(),
          late: [fxTask({ id: 'T-1', plan_id: 'p-q3', title: 'Login storm' })],
        }),
      ),
    );
    const { router } = renderPage();
    const link = await screen.findByRole('link', { name: /login storm/i });
    expect(link).toHaveAttribute('href', '/planner/plans/p-q3/tasks/T-1');
    await userEvent.click(link);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/planner/plans/p-q3/tasks/T-1');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('selecting Priority pill calls onFiltersChange with { priority: 1 }', async () => {
    server.use(http.get('*/api/planner/v1/my-tasks', () => HttpResponse.json(emptyResult())));
    const { setFilters } = renderPage();
    await screen.findByText(/all caught up/i);
    await userEvent.click(screen.getByRole('button', { name: /priority/i }));
    await userEvent.click(await screen.findByText('Urgent'));
    expect(setFilters).toHaveBeenCalledWith(expect.objectContaining({ priority: 1 }));
  });

  it('toggling SegmentedControl to Grid calls onFiltersChange with view: grid', async () => {
    server.use(
      http.get('*/api/planner/v1/my-tasks', () =>
        HttpResponse.json({
          ...emptyResult(),
          late: [fxTask({ title: 'Login storm' })],
        }),
      ),
    );
    const { setFilters } = renderPage();
    await screen.findByText('Login storm');
    expect(screen.queryByTestId('my-tasks-grid')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /grid view/i }));
    expect(setFilters).toHaveBeenCalledWith(expect.objectContaining({ view: 'grid' }));
  });

  it('renders MyTasksGrid when filters.view is grid', async () => {
    server.use(
      http.get('*/api/planner/v1/my-tasks', () =>
        HttpResponse.json({
          ...emptyResult(),
          late: [fxTask({ title: 'Login storm' })],
        }),
      ),
    );
    renderPage({ view: 'grid' });
    expect(await screen.findByTestId('my-tasks-grid')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-testid="mt-section"]').length).toBe(0);
  });
});
