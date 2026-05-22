import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useSelectedTaskIds } from '../state/selected-task-ids';
import { EMPTY_FILTERS } from '../state/url-state';
import { PlanGridPage } from './plan-grid-page';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => useSelectedTaskIds.getState().clear());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderWith(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
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
  sort_order: 1_000_000,
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
  sort_order: 2_000_000,
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
  priority: 'medium' as const,
  progress: 'not_started' as const,
  review_state: null,
  skill_tags: [],
  due_at: null,
  sort_order: 1_000_000,
  created_by: 'u',
  created_at: '',
  updated_at: '',
  deleted_at: null,
  version: 1,
  assignees: [],
  labels: [],
  checklist_summary: { total: 0, checked: 0 },
};

const taskTwo = {
  ...taskOne,
  id: 't2',
  title: 'Write tests',
  bucket_id: 'b2',
  version: 2,
};

function seedBoardHandlers() {
  return [
    http.get('*/api/planner/v1/plans/p1', () => HttpResponse.json(planFixture)),
    http.get('*/api/planner/v1/plans/p1/buckets', () =>
      HttpResponse.json({ buckets: [bucketTodo, bucketDone] }),
    ),
    http.get('*/api/planner/v1/tasks', () => HttpResponse.json({ tasks: [taskOne, taskTwo] })),
    http.get('*/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
  ];
}

function renderPage() {
  return renderWith(
    <PlanGridPage
      planId="p1"
      filters={EMPTY_FILTERS}
      onFiltersChange={() => {}}
      onOpenTask={() => {}}
      view="grid"
      onViewChange={() => {}}
      groupBy="bucket"
      onGroupByChange={() => {}}
    />,
  );
}

describe('PlanGridPage', () => {
  it('renders SyncBadge in header when plan is linked to m365', async () => {
    server.use(
      http.get('*/api/planner/v1/plans/p1', () => HttpResponse.json(m365LinkedPlanFixture)),
      http.get('*/api/planner/v1/plans/p1/buckets', () =>
        HttpResponse.json({ buckets: [bucketTodo, bucketDone] }),
      ),
      http.get('*/api/planner/v1/tasks', () => HttpResponse.json({ tasks: [taskOne] })),
      http.get('*/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
    );
    renderPage();
    expect(await screen.findByText(/synced/i)).toBeInTheDocument();
  });

  it('renders no sync banners or pulling empty state when plan is idle', async () => {
    server.use(...seedBoardHandlers());
    renderPage();
    await screen.findByText('Wire up DnD');
    expect(screen.queryByTestId('plan-sync-error-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('plan-sync-conflict-banner')).not.toBeInTheDocument();
    expect(screen.queryByText(/Syncing from M365 Planner/)).not.toBeInTheDocument();
  });

  it('renders an error banner with humanized message and a Retry sync button when sync_status=error', async () => {
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
    );
    renderPage();
    const banner = await screen.findByTestId('plan-sync-error-banner');
    expect(banner).toHaveTextContent('Sync failed: Network unreachable');
    expect(screen.getByRole('button', { name: 'Retry sync' })).toBeInTheDocument();
  });

  it('renders a conflict banner with a Resolve now button that opens the conflicts dialog', async () => {
    server.use(
      http.get('*/api/planner/v1/plans/p1', () =>
        HttpResponse.json({ ...m365LinkedPlanFixture, sync_status: 'conflict' }),
      ),
      http.get('*/api/planner/v1/plans/p1/buckets', () =>
        HttpResponse.json({ buckets: [bucketTodo, bucketDone] }),
      ),
      http.get('*/api/planner/v1/tasks', () => HttpResponse.json({ tasks: [taskOne] })),
      http.get('*/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
    );
    renderPage();
    expect(await screen.findByTestId('plan-sync-conflict-banner')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Resolve now' }));
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
    );
    renderPage();
    expect(await screen.findByText(/Syncing from M365 Planner/)).toBeInTheDocument();
  });

  it('renders skeleton while board is loading', () => {
    server.use(
      http.get('*/api/planner/v1/plans/p1', async () => {
        await new Promise((r) => setTimeout(r, 1_000));
        return HttpResponse.json(planFixture);
      }),
      http.get('*/api/planner/v1/plans/p1/buckets', () => HttpResponse.json({ buckets: [] })),
      http.get('*/api/planner/v1/tasks', () => HttpResponse.json({ tasks: [] })),
      http.get('*/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
    );
    renderPage();
    expect(screen.getByTestId('grid-skeleton')).toBeInTheDocument();
  });

  it('renders rows and group header after load', async () => {
    server.use(...seedBoardHandlers());
    renderPage();
    expect(await screen.findByText('Wire up DnD')).toBeInTheDocument();
    // Group header text is split across elements (name + count span); match by class
    const groupRows = Array.from(document.querySelectorAll('.task-grid__group-header'));
    expect(
      groupRows.some((r) => r.textContent?.includes('To do') && r.textContent?.includes('1')),
    ).toBe(true);
    expect(screen.getByText('Write tests')).toBeInTheDocument();
  });

  it('has no a11y violations on the happy path', async () => {
    server.use(...seedBoardHandlers());
    const { container } = renderPage();
    await screen.findByText('Wire up DnD');
    const results = await axe(container);
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
    renderPage();
    await screen.findByText('Wire up DnD');

    const user = userEvent.setup();
    // Click the title cell to open inline editor
    await user.click(screen.getByText('Wire up DnD'));
    const input = await screen.findByDisplayValue('Wire up DnD');
    await user.clear(input);
    await user.type(input, 'Updated title');
    await user.keyboard('{Enter}');

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ patch: { title: 'Updated title' } });
  });

  it('shift-click range selection drives bulk footer count', async () => {
    server.use(...seedBoardHandlers());
    renderPage();
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
    renderPage();
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
      http.post('*/api/planner/v1/tasks/:taskId/assign', async ({ params, request }) => {
        const body = (await request.json()) as { user_id: string };
        assignCalls.push({ taskId: params.taskId as string, user_id: body.user_id });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPage();
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
    renderPage();
    await screen.findByText('Wire up DnD');

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('checkbox')[0]!);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(deleteCalls).toContain('t1');
  });
});
