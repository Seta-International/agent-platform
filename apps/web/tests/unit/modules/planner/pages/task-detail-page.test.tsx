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
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { delay, HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/copilot/chat-experience/copilot-provider', () => ({
  usePageContext: () => ({
    pageContext: null,
    setPageContext: vi.fn(),
    suppressedFor: null,
    suppressFor: vi.fn(),
    clearSuppression: vi.fn(),
  }),
  usePanelUI: () => ({
    panelOpen: false,
    setPanelOpen: vi.fn(),
    pendingPrompt: null,
    setPendingPrompt: vi.fn(),
  }),
}));

import type { SessionScopeProjection } from '@/modules/identity/api/client';
import { SessionProvider } from '../../../../../src/modules/identity/components/SessionProvider';
import { TaskDetailPage } from '../../../../../src/modules/planner/pages/task-detail-page';
import {
  makePlan,
  makeTaskWithAssignees,
} from '../../../../../src/modules/planner/testing/fixtures';

const fxSession: SessionScopeProjection = {
  user_id: 'u-self',
  tenant_id: 't',
  tenant_name: 'Acme',
  tenant_slug: 'acme',
  email: 'self@acme.test',
  display_name: 'Me',
  role_summary: { roles: ['tenant.admin'], cross_tenant_read: false },
  accessible_group_ids: ['g1'],
  cross_tenant_read: false,
  tenant_local_password_disabled: false,
};

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
      <SessionProvider session={fxSession}>
        <RouterProvider router={router} />
      </SessionProvider>
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
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
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

    // Title now lives in an editable input in the body (TaskTitleEditor), not an <h1>.
    expect(await screen.findByLabelText('Task title')).toHaveValue('Wire telemetry');

    expect(screen.getByRole('region', { name: /description/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /references/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /checklist/i })).toBeInTheDocument();

    expect(screen.getByRole('region', { name: /^progress$/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /^priority$/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /^schedule$/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /show on card/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /assignees/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /labels/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /external/i })).toBeInTheDocument();
  });

  it('J/K nav navigates to next/previous task in same plan', async () => {
    const tasks = [
      makeTaskWithAssignees({ id: 't1', plan_id: 'p1', order_hint: 'a', title: 'First' }),
      makeTaskWithAssignees({ id: 't2', plan_id: 'p1', order_hint: 'b', title: 'Second' }),
      makeTaskWithAssignees({ id: 't3', plan_id: 'p1', order_hint: 'c', title: 'Third' }),
    ];
    const detailsById: Record<string, TaskDetailRow> = {
      t1: buildTaskDetail({ id: 't1', title: 'First' }),
      t2: buildTaskDetail({ id: 't2', title: 'Second' }),
      t3: buildTaskDetail({ id: 't3', title: 'Third' }),
    };
    server.use(
      http.get('/api/planner/v1/tasks/:taskId', ({ params }) => {
        const detail = detailsById[params.taskId as string];
        return detail
          ? HttpResponse.json(detail)
          : HttpResponse.json({ error: 'NOT_FOUND', message: 'no task' }, { status: 404 });
      }),
      http.get('/api/planner/v1/plans/p1', () => HttpResponse.json(makePlan({ id: 'p1' }))),
      http.get('/api/planner/v1/plans/p1/buckets', () => HttpResponse.json({ buckets: [] })),
      http.get('/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
      http.get('/api/planner/v1/tasks', () => HttpResponse.json({ tasks })),
    );

    // Local route setup so the rendered taskId tracks URL params after each
    // J/K navigation — without this, the page would keep using the initial
    // closure value and prev/next derivation would not advance.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const detailRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/planner/plans/$planId/tasks/$taskId',
      component: function RouteCmp() {
        const { planId, taskId } = detailRoute.useParams();
        return <TaskDetailPage planId={planId} taskId={taskId} />;
      },
    });
    const routeTree = rootRoute.addChildren([detailRoute]);
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/planner/plans/p1/tasks/t2'] }),
    });
    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider session={fxSession}>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Task title')).toHaveValue('Second');
    });

    fireEvent.keyDown(document.body, { key: 'j' });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/planner/plans/p1/tasks/t3');
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Task title')).toHaveValue('Third');
    });

    // On the last task, J is a no-op (nextTaskId is undefined).
    fireEvent.keyDown(document.body, { key: 'j' });
    await new Promise((r) => setTimeout(r, 20));
    expect(router.state.location.pathname).toBe('/planner/plans/p1/tasks/t3');

    fireEvent.keyDown(document.body, { key: 'k' });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/planner/plans/p1/tasks/t2');
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Task title')).toHaveValue('Second');
    });

    fireEvent.keyDown(document.body, { key: 'k' });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/planner/plans/p1/tasks/t1');
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Task title')).toHaveValue('First');
    });

    // On the first task, K is a no-op (prevTaskId is undefined).
    fireEvent.keyDown(document.body, { key: 'k' });
    await new Promise((r) => setTimeout(r, 20));
    expect(router.state.location.pathname).toBe('/planner/plans/p1/tasks/t1');
  });

  it('page variant: More > Delete opens confirm dialog, then DELETEs and navigates back to the plan board', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    let deleteCalled = false;
    let deleteBody: { expected_version?: number } | undefined;
    server.use(
      http.get('/api/planner/v1/tasks/t1', () =>
        HttpResponse.json(buildTaskDetail({ id: 't1', title: 'Wire telemetry', version: 4 })),
      ),
      http.get('/api/planner/v1/plans/p1', () => HttpResponse.json(makePlan({ id: 'p1' }))),
      http.get('/api/planner/v1/plans/p1/buckets', () => HttpResponse.json({ buckets: [] })),
      http.get('/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
      http.get('/api/planner/v1/tasks', () => HttpResponse.json({ tasks: [] })),
      http.delete('/api/planner/v1/tasks/t1', async ({ request }) => {
        deleteCalled = true;
        deleteBody = (await request.json()) as { expected_version: number };
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const router = renderPage('t1', 'p1');
    await screen.findByLabelText('Task title');

    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^delete$/i }));

    // Confirm dialog opens with the task title quoted in its body
    const dialog = await screen.findByRole('dialog');
    expect(await screen.findByRole('heading', { name: /delete this task\?/i })).toBeInTheDocument();
    const { within } = await import('@testing-library/react');
    expect(within(dialog).getByText(/wire telemetry/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /delete task/i }));

    await waitFor(() => {
      expect(deleteCalled).toBe(true);
    });
    expect(deleteBody?.expected_version).toBe(4);

    // Page variant navigates back to the plan board on success. We didn't
    // register the plan board route in this harness, so the router's pending
    // navigation surfaces as a pathname change rather than a rendered view —
    // that's enough to prove the success branch fired.
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/planner/plans/p1');
    });
  });

  it('modal variant: More > Delete confirms, DELETEs, and calls onDeleted', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    let deleteCalled = false;
    const onDeleted = vi.fn();
    server.use(
      http.get('/api/planner/v1/tasks/t9', () =>
        HttpResponse.json(buildTaskDetail({ id: 't9', title: 'Ship it', version: 2 })),
      ),
      http.get('/api/planner/v1/plans/p1', () => HttpResponse.json(makePlan({ id: 'p1' }))),
      http.get('/api/planner/v1/plans/p1/buckets', () => HttpResponse.json({ buckets: [] })),
      http.get('/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
      http.get('/api/planner/v1/tasks', () => HttpResponse.json({ tasks: [] })),
      http.delete('/api/planner/v1/tasks/t9', () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const detailRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/planner/plans/$planId/tasks/$taskId',
      component: () => (
        <TaskDetailPage planId="p1" taskId="t9" variant="modal" onDeleted={onDeleted} />
      ),
    });
    const routeTree = rootRoute.addChildren([detailRoute]);
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/planner/plans/p1/tasks/t9'] }),
    });
    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider session={fxSession}>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>,
    );

    await screen.findByLabelText('Task title');

    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^delete$/i }));

    expect(await screen.findByRole('heading', { name: /delete this task\?/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /delete task/i }));

    await waitFor(() => {
      expect(deleteCalled).toBe(true);
    });
    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalledTimes(1);
    });
  });
});
