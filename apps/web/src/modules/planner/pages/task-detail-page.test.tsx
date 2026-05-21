import type { TaskDetailRow } from '@seta/planner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { delay, HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { makeTaskWithAssignees } from '../testing/fixtures';
import { TaskDetailPage } from './task-detail-page';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function buildTaskDetail(over: Partial<TaskDetailRow> = {}): TaskDetailRow {
  return {
    ...makeTaskWithAssignees(),
    checklist: [],
    references: [],
    ...over,
  };
}

interface RenderOptions {
  initialPath?: string;
}

function renderPage(taskId: string, planId: string, opts: RenderOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/planner/plans/$planId/tasks/$taskId',
    component: () => <TaskDetailPage planId={planId} taskId={taskId} />,
  });
  const groupsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/planner/groups',
    component: () => <div data-testid="groups-page">groups list</div>,
  });
  const routeTree = rootRoute.addChildren([detailRoute, groupsRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [opts.initialPath ?? `/planner/plans/${planId}/tasks/${taskId}`],
    }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('TaskDetailPage', () => {
  it('renders a loading skeleton while the task is loading', async () => {
    server.use(
      http.get('/api/planner/v1/tasks/t1', async () => {
        await delay(50);
        return HttpResponse.json(buildTaskDetail({ id: 't1' }));
      }),
    );
    renderPage('t1', 'p1');
    expect(await screen.findByRole('status', { name: /loading task/i })).toBeInTheDocument();
  });

  it('renders an error state with a retry button on fetch failure', async () => {
    server.use(
      http.get('/api/planner/v1/tasks/t1', () =>
        HttpResponse.json({ error: 'BOOM', message: '500 server error' }, { status: 500 }),
      ),
    );
    renderPage('t1', 'p1');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('redirects to /planner/groups with a toast on permission revoke (403)', async () => {
    server.use(
      http.get('/api/planner/v1/tasks/t1', () =>
        HttpResponse.json({ error: 'FORBIDDEN', message: 'no access' }, { status: 403 }),
      ),
    );
    const router = renderPage('t1', 'p1');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/planner/groups');
    });
  });

  it('renders the header, the three main cards, and the seven rail cards on success', async () => {
    server.use(
      http.get('/api/planner/v1/tasks/t1', () =>
        HttpResponse.json(buildTaskDetail({ id: 't1', title: 'Wire telemetry' })),
      ),
      http.get('/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
    );
    renderPage('t1', 'p1');

    expect(
      await screen.findByRole('heading', { name: 'Wire telemetry', level: 1 }),
    ).toBeInTheDocument();

    expect(screen.getByRole('region', { name: /description/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /references/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /checklist/i })).toBeInTheDocument();

    expect(screen.getByRole('region', { name: /^progress$/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /^priority$/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /^schedule$/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /preview type/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /assignees/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /labels/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /external/i })).toBeInTheDocument();
  });
});
