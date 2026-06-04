import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SessionScopeProjection } from '../../../../../src/modules/identity/api/client';
import { SessionProvider } from '../../../../../src/modules/identity/components/SessionProvider';
import { PlanBoardShell } from '../../../../../src/modules/planner/pages/plan-board-shell';
import { useSelectedTaskIds } from '../../../../../src/modules/planner/state/selected-task-ids';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => useSelectedTaskIds.getState().clear());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const session: SessionScopeProjection = {
  user_id: 'u-self',
  tenant_id: 't',
  tenant_name: 'Acme',
  tenant_slug: 'acme',
  email: 'u@acme.test',
  display_name: 'Me',
  role_summary: { roles: ['tenant.admin'], cross_tenant_read: false },
  accessible_group_ids: ['g1'],
  cross_tenant_read: false,
  tenant_local_password_disabled: false,
};

function withRouter(node: ReactNode) {
  const rootRoute = createRootRoute({ component: () => node });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => node,
  });
  const groupsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/planner/groups',
    component: () => null,
  });
  const groupDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/planner/groups/$groupId',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, groupsRoute, groupDetailRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return <RouterProvider router={router} />;
}

function renderShell() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SessionProvider session={session}>
        {withRouter(
          <PlanBoardShell
            planId="p1"
            search={{ view: 'grid' }}
            onQChange={() => {}}
            onFiltersChange={() => {}}
            onViewChange={() => {}}
            onGroupByChange={() => {}}
            onOpenTask={() => {}}
            onLeaveAfterDelete={() => {}}
            onCalendarRangeChange={() => {}}
            onCalendarPageChange={() => {}}
          />,
        )}
      </SessionProvider>
    </QueryClientProvider>,
  );
}

const planFixture = {
  id: 'p1',
  tenant_id: 't',
  group_id: 'g1',
  name: 'Q3 Launch',
  category_descriptions: {},
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
};

const m365LinkedPlanFixture = {
  ...planFixture,
  external_source: 'm365',
  external_id: 'ext-plan-123',
  external_synced_at: '2026-05-22T10:00:00Z',
  sync_status: 'idle',
};

const bucketTodo = {
  id: 'b1',
  tenant_id: 't',
  plan_id: 'p1',
  name: 'To do',
  order_hint: 'm',
  external_source: 'native',
  external_id: null,
  external_etag: null,
  external_synced_at: null,
  created_at: '',
  updated_at: '',
  deleted_at: null,
  version: 1,
};

const bucketDone = {
  id: 'b2',
  tenant_id: 't',
  plan_id: 'p1',
  name: 'Done',
  order_hint: 'n',
  external_source: 'native',
  external_id: null,
  external_etag: null,
  external_synced_at: null,
  created_at: '',
  updated_at: '',
  deleted_at: null,
  version: 1,
};

const taskOne = {
  id: 't1',
  tenant_id: 't',
  plan_id: 'p1',
  bucket_id: 'b1',
  title: 'Wire up DnD',
  description: null,
  priority_number: 5,
  percent_complete: 0,
  is_deferred: false,
  preview_type: 'automatic',
  review_state: null,
  skill_tags: [],
  start_at: null,
  due_at: null,
  order_hint: 'm',
  assignee_priority: null,
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
  assignees: [],
  labels: [],
  checklist_summary: { total: 0, checked: 0 },
  checklist_preview: [],
  reference_preview: [],
};

const taskTwo = {
  ...taskOne,
  id: 't2',
  title: 'Write tests',
  bucket_id: 'b2',
  version: 2,
};

function groupFixture() {
  return {
    id: 'g1',
    tenant_id: 't',
    name: 'Engineering',
    external_source: 'native',
    external_id: null,
    external_etag: null,
    external_synced_at: null,
    created_at: '',
    updated_at: '',
    deleted_at: null,
    version: 1,
  };
}

function seedBoardHandlers() {
  return [
    http.get('*/api/planner/v1/plans/p1', () => HttpResponse.json(planFixture)),
    http.get('*/api/planner/v1/plans/p1/buckets', () =>
      HttpResponse.json({ buckets: [bucketTodo, bucketDone] }),
    ),
    http.get('*/api/planner/v1/tasks', () => HttpResponse.json({ tasks: [taskOne, taskTwo] })),
    http.get('*/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
    http.get('*/api/planner/v1/groups/g1', () => HttpResponse.json(groupFixture())),
  ];
}

describe('PlanGridPage (via PlanBoardShell)', () => {
  it('renders SyncBadge in header when plan is linked to m365', async () => {
    server.use(
      http.get('*/api/planner/v1/plans/p1', () => HttpResponse.json(m365LinkedPlanFixture)),
      http.get('*/api/planner/v1/plans/p1/buckets', () =>
        HttpResponse.json({ buckets: [bucketTodo, bucketDone] }),
      ),
      http.get('*/api/planner/v1/tasks', () => HttpResponse.json({ tasks: [taskOne] })),
      http.get('*/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
      http.get('*/api/planner/v1/groups/g1', () => HttpResponse.json(groupFixture())),
    );
    renderShell();
    expect(await screen.findByText(/synced/i)).toBeInTheDocument();
  });

  it('renders no sync banners or pulling empty state when plan is idle', async () => {
    server.use(...seedBoardHandlers());
    renderShell();
    await screen.findByText('Wire up DnD');
    expect(screen.queryByTestId('plan-sync-error-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('plan-sync-conflict-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('plan-sync-pulling-empty')).not.toBeInTheDocument();
  });

  it('renders an error banner with humanized message and a retry button when sync_status=error', async () => {
    server.use(
      http.get('*/api/planner/v1/plans/p1', () =>
        HttpResponse.json({
          ...m365LinkedPlanFixture,
          sync_status: 'error',
          last_error: 'Network unreachable',
        }),
      ),
      http.get('*/api/planner/v1/plans/p1/buckets', () =>
        HttpResponse.json({ buckets: [bucketTodo, bucketDone] }),
      ),
      http.get('*/api/planner/v1/tasks', () => HttpResponse.json({ tasks: [taskOne] })),
      http.get('*/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
      http.get('*/api/planner/v1/groups/g1', () => HttpResponse.json(groupFixture())),
    );
    renderShell();
    const banner = await screen.findByTestId('plan-sync-error-banner');
    expect(banner).toHaveTextContent(/Sync didn't work: Network unreachable/);
    expect(screen.getByRole('button', { name: 'Try sync again' })).toBeInTheDocument();
  });

  it('renders a conflict banner with a review button that opens the conflicts dialog', async () => {
    server.use(
      http.get('*/api/planner/v1/plans/p1', () =>
        HttpResponse.json({ ...m365LinkedPlanFixture, sync_status: 'conflict' }),
      ),
      http.get('*/api/planner/v1/plans/p1/buckets', () =>
        HttpResponse.json({ buckets: [bucketTodo, bucketDone] }),
      ),
      http.get('*/api/planner/v1/tasks', () => HttpResponse.json({ tasks: [taskOne] })),
      http.get('*/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
      http.get('*/api/planner/v1/groups/g1', () => HttpResponse.json(groupFixture())),
    );
    renderShell();
    expect(await screen.findByTestId('plan-sync-conflict-banner')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Review changes' }));
    expect(await screen.findByText('Resolve sync conflicts')).toBeInTheDocument();
  });

  it('renders the pulling empty state when sync_status=pulling and tasks are empty', async () => {
    server.use(
      http.get('*/api/planner/v1/plans/p1', () =>
        HttpResponse.json({ ...m365LinkedPlanFixture, sync_status: 'pulling' }),
      ),
      http.get('*/api/planner/v1/plans/p1/buckets', () => HttpResponse.json({ buckets: [] })),
      http.get('*/api/planner/v1/tasks', () => HttpResponse.json({ tasks: [] })),
      http.get('*/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
      http.get('*/api/planner/v1/groups/g1', () => HttpResponse.json(groupFixture())),
    );
    renderShell();
    expect(await screen.findByTestId('plan-sync-pulling-empty')).toBeInTheDocument();
  });

  it('renders skeleton while board is loading', async () => {
    server.use(
      http.get('*/api/planner/v1/plans/p1', async () => {
        await new Promise((r) => setTimeout(r, 1_000));
        return HttpResponse.json(planFixture);
      }),
      http.get('*/api/planner/v1/plans/p1/buckets', () => HttpResponse.json({ buckets: [] })),
      http.get('*/api/planner/v1/tasks', () => HttpResponse.json({ tasks: [] })),
      http.get('*/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
      http.get('*/api/planner/v1/groups/g1', () => HttpResponse.json(groupFixture())),
    );
    renderShell();
    expect(await screen.findByTestId('grid-skeleton')).toBeInTheDocument();
  });

  it('renders rows and group header after load', async () => {
    server.use(...seedBoardHandlers());
    renderShell();
    expect(await screen.findByText('Wire up DnD')).toBeInTheDocument();
    expect(screen.getByText('Write tests')).toBeInTheDocument();
    // "To do" appears in both the group header AND in each row's bucket pill,
    // so allow either form.
    expect(screen.getAllByText('To do').length).toBeGreaterThanOrEqual(1);
  });

  it('has no a11y violations on the happy path', async () => {
    server.use(...seedBoardHandlers());
    const { container } = renderShell();
    await screen.findByText('Wire up DnD');
    // TaskGrid uses CSS grid for layout but exposes role="row" on rows so RTL
    // queries can target them. The required grid/rowgroup wrapper is intentionally
    // omitted because <table> would break the CSS-grid layout; disable the rule.
    const results = await axe(container, {
      rules: {
        'aria-required-parent': { enabled: false },
        'aria-required-children': { enabled: false },
      },
    });
    expect(results).toHaveNoViolations();
  });

  it('inline title edit commits via PATCH /api/planner/v1/tasks/:id', async () => {
    const captured: unknown[] = [];
    server.use(
      ...seedBoardHandlers(),
      http.patch('*/api/planner/v1/tasks/t1', async ({ request }) => {
        const body = await request.json();
        captured.push(body);
        return HttpResponse.json({ ...taskOne, title: 'Updated title' });
      }),
    );
    renderShell();
    await screen.findByText('Wire up DnD');

    const user = userEvent.setup();
    // Title cell shows a "Rename" pencil button on hover; click it to open inline editor.
    await user.click(screen.getByRole('button', { name: 'Rename Wire up DnD' }));
    const input = await screen.findByDisplayValue('Wire up DnD');
    await user.clear(input);
    await user.type(input, 'Updated title');
    await user.keyboard('{Enter}');

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ patch: { title: 'Updated title' } });
  });

  it('shift-click range selection drives bulk footer count', async () => {
    server.use(...seedBoardHandlers());
    renderShell();
    await screen.findByText('Wire up DnD');

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!, { shiftKey: true });

    // Footer should now show 2 selected
    expect(screen.getByRole('toolbar', { name: '2 tasks selected' })).toBeInTheDocument();
  });

  it('bulk move triggers POST /api/planner/v1/tasks/:id/move for each selected task', async () => {
    const moveCalls: string[] = [];
    server.use(
      ...seedBoardHandlers(),
      http.post('*/api/planner/v1/tasks/:taskId/move', ({ params }) => {
        moveCalls.push(params.taskId as string);
        return HttpResponse.json({ ...taskOne, bucket_id: 'b2' });
      }),
    );
    renderShell();
    await screen.findByText('Wire up DnD');

    const user = userEvent.setup();
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]!);

    // Click Move to open the bucket popover, then pick Done
    await user.click(await screen.findByRole('button', { name: 'Move' }));
    await user.click(await screen.findByRole('button', { name: 'Done' }));

    expect(moveCalls).toContain('t1');
  });

  it('bulk assign triggers POST /api/planner/v1/tasks/:id/assign for each selected task', async () => {
    const assignCalls: Array<{ taskId: string; user_id: string }> = [];
    server.use(
      http.get('*/api/planner/v1/plans/p1', () => HttpResponse.json(planFixture)),
      http.get('*/api/planner/v1/plans/p1/buckets', () =>
        HttpResponse.json({ buckets: [bucketTodo, bucketDone] }),
      ),
      http.get('*/api/planner/v1/tasks', () =>
        HttpResponse.json({
          tasks: [{ ...taskOne, assignees: [{ user_id: 'u1', display_name: 'Alice' }] }, taskTwo],
        }),
      ),
      http.get('*/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
      http.get('*/api/planner/v1/groups/g1', () => HttpResponse.json(groupFixture())),
      http.post('*/api/planner/v1/tasks/:taskId/assign', async ({ params, request }) => {
        const body = (await request.json()) as { user_id: string };
        assignCalls.push({ taskId: params.taskId as string, user_id: body.user_id });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderShell();
    await screen.findByText('Wire up DnD');

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('checkbox')[0]!);
    await user.click(await screen.findByRole('button', { name: 'Assign' }));
    await user.click(await screen.findByRole('button', { name: 'Alice' }));

    expect(assignCalls).toContainEqual({ taskId: 't1', user_id: 'u1' });
  });

  it('bulk delete triggers DELETE /api/planner/v1/tasks/:id for each selected task', async () => {
    const deleteCalls: string[] = [];
    server.use(
      ...seedBoardHandlers(),
      http.delete('*/api/planner/v1/tasks/:taskId', ({ params }) => {
        deleteCalls.push(params.taskId as string);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderShell();
    await screen.findByText('Wire up DnD');

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('checkbox')[0]!);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(deleteCalls).toContain('t1');
  });

  it('renders the calendar view when view=calendar', async () => {
    // Reuse this file's standard plan/buckets/tasks/labels handlers, plus:
    server.use(
      ...seedBoardHandlers(),
      http.get('/api/planner/v1/plans/p1/tasks/calendar', () =>
        HttpResponse.json({ tasks: [], total_count: 0 }),
      ),
    );

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc}>
        <SessionProvider session={session}>
          {withRouter(
            <PlanBoardShell
              planId="p1"
              search={{ view: 'calendar', calFrom: '2026-06-01', calTo: '2026-06-30' }}
              onQChange={() => {}}
              onFiltersChange={() => {}}
              onViewChange={() => {}}
              onGroupByChange={() => {}}
              onOpenTask={() => {}}
              onLeaveAfterDelete={() => {}}
              onCalendarRangeChange={() => {}}
              onCalendarPageChange={() => {}}
            />,
          )}
        </SessionProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('plan-calendar-page')).toBeInTheDocument();
    expect(screen.getByLabelText('Calendar view')).toBeInTheDocument();
  });
});
