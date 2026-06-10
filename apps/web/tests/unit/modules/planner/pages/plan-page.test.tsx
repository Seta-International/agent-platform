import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SessionScopeProjection } from '../../../../../src/modules/identity/api/client';
import { SessionProvider } from '../../../../../src/modules/identity/components/SessionProvider';
import { PlanBoardShell } from '../../../../../src/modules/planner/pages/plan-board-shell';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
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
  permissions: [],
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

function renderShell(searchOverrides: Record<string, string | undefined> = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SessionProvider session={session}>
        {withRouter(
          <PlanBoardShell
            planId="p1"
            search={searchOverrides}
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
    http.get('*/api/planner/v1/tasks', () => HttpResponse.json({ tasks: [taskOne] })),
    http.get('*/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
    http.get('*/api/planner/v1/groups/g1', () => HttpResponse.json(groupFixture())),
  ];
}

describe('PlanPage (via PlanBoardShell)', () => {
  it('renders the board skeleton while pending', async () => {
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
    expect(await screen.findByTestId('board-skeleton')).toBeInTheDocument();
  });

  it('renders buckets and task cards from the API', async () => {
    server.use(...seedBoardHandlers());
    renderShell();
    expect(await screen.findByText('To do')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Wire up DnD')).toBeInTheDocument();
  });

  it('uses virtualized list when bucket has > 50 cards', async () => {
    const manyTasks = Array.from({ length: 60 }, (_, i) => ({
      ...taskOne,
      id: `t${i}`,
      order_hint: String(i).padStart(4, '0'),
    }));
    server.use(
      http.get('*/api/planner/v1/plans/p1', () => HttpResponse.json(planFixture)),
      http.get('*/api/planner/v1/plans/p1/buckets', () =>
        HttpResponse.json({ buckets: [bucketTodo, bucketDone] }),
      ),
      http.get('*/api/planner/v1/tasks', () => HttpResponse.json({ tasks: manyTasks })),
      http.get('*/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
      http.get('*/api/planner/v1/groups/g1', () => HttpResponse.json(groupFixture())),
    );
    renderShell();
    expect(await screen.findByTestId('virtualized-bucket-list')).toBeInTheDocument();
  });

  it('has no a11y violations on the happy path', async () => {
    server.use(...seedBoardHandlers());
    const { container } = renderShell();
    await screen.findByText('To do');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('board card body renders PreviewBody content for tasks with a description', async () => {
    const richTask = {
      ...taskOne,
      id: 't-desc',
      title: 'With body',
      description: 'Ship the release notes by Friday',
      preview_type: 'automatic',
    };
    server.use(
      http.get('*/api/planner/v1/plans/p1', () => HttpResponse.json(planFixture)),
      http.get('*/api/planner/v1/plans/p1/buckets', () =>
        HttpResponse.json({ buckets: [bucketTodo, bucketDone] }),
      ),
      http.get('*/api/planner/v1/tasks', () => HttpResponse.json({ tasks: [richTask] })),
      http.get('*/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
      http.get('*/api/planner/v1/groups/g1', () => HttpResponse.json(groupFixture())),
    );
    renderShell();
    await waitFor(() => {
      expect(screen.getByText(/Ship the release notes/)).toBeInTheDocument();
    });
    // PreviewBody attribution renders as two text nodes ("picked from " + source),
    // so match on the wrapper's full text content instead of a single node.
    const description = screen.getByText(/Ship the release notes/);
    const wrapper = description.closest('[data-role="preview-body"]');
    expect(wrapper?.textContent).toContain('picked from description');
  });

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
    await screen.findByText('To do');
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

  it('quick-create on a bucket fires createTask with the typed title', async () => {
    const captured = vi.fn();
    server.use(
      ...seedBoardHandlers(),
      // The mutation now goes through planner first to create the row, then
      // kicks off the dedup workflow asynchronously. Capture the create-task
      // call — that's what carries the user-supplied title and bucket.
      http.post('*/api/planner/v1/tasks', async ({ request }) => {
        const body = (await request.json()) as {
          title: string;
          bucket_id?: string;
          plan_id?: string;
        };
        captured(body);
        return HttpResponse.json({ id: 'task-new', title: body.title, version: 1 });
      }),
      // Stub the (best-effort) dedup workflow so the mutation can complete
      // without 404ing on the unhandled request.
      http.post('*/api/agent/v1/workflows/runs/planner.dedupOnCreate/start', () =>
        HttpResponse.json({ runId: 'run-dedup-1' }),
      ),
    );
    renderShell();

    await screen.findByText('To do');
    const user = userEvent.setup();
    // Two quick-create buttons exist (one per bucket); the first belongs to "To do".
    const addButtons = screen.getAllByRole('button', { name: /\+ Add a task/ });
    await user.click(addButtons[0]!);
    const input = await screen.findByPlaceholderText('Task title');
    await user.type(input, 'New task from test');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(captured).toHaveBeenCalledTimes(1));
    expect(captured.mock.calls[0]![0]).toMatchObject({
      title: 'New task from test',
      bucket_id: 'b1',
      plan_id: 'p1',
    });
  });
});
