import type { AssigneeRow, LabelRow, TaskWithPlan } from '@seta/planner';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MtTaskRow,
  type MyTasksRowTask,
} from '../../../../../../src/modules/planner/components/my-tasks/mt-task-row';

afterEach(() => cleanup());

function fxLabel(name: string, color = 'blue'): LabelRow {
  return {
    id: `lbl-${name}`,
    tenant_id: 't',
    plan_id: 'p-q3',
    name,
    color,
    category_slot: null,
    created_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
  };
}

function fxAssignee(user_id: string, display_name: string): AssigneeRow {
  return {
    user_id,
    display_name,
    email: `${user_id}@example.com`,
    availability_status: 'available',
    ooo_until: null,
    deactivated_at: null,
  };
}

function fxTask(over: Partial<MyTasksRowTask> = {}): MyTasksRowTask {
  const base: TaskWithPlan = {
    id: 'T-1294',
    tenant_id: 't',
    plan_id: 'p-q3',
    bucket_id: null,
    title: 'Fix login retry storm',
    description: null,
    description_text: null,
    priority_number: 5,
    percent_complete: 0,
    is_deferred: false,
    preview_type: 'automatic',
    review_state: null,
    start_at: null,
    due_at: '2026-08-12T00:00:00.000Z',
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
  };
  return { ...base, ...over };
}

function renderInRouter(ui: ReactNode, initialPath = '/') {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <>{ui}</>,
  });
  const taskRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/planner/plans/$planId/tasks/$taskId',
    component: () => <div data-testid="task-detail-stub" />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, taskRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('MtTaskRow', () => {
  it('renders title, plan, priority, percent, status, due, labels, avatars', async () => {
    renderInRouter(
      <MtTaskRow
        task={fxTask({
          priority_number: 1,
          percent_complete: 60,
          is_deferred: false,
          labels: [fxLabel('backend')],
          assignees: [fxAssignee('u1', 'Jane Doe')],
        })}
      />,
    );
    expect(await screen.findByText('Fix login retry storm')).toBeInTheDocument();
    expect(screen.getByTestId('task-plan').textContent).toContain('Q3 Launch');
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText(/Aug 12/)).toBeInTheDocument();
    expect(screen.getByTestId('avatar-stack')).toBeInTheDocument();
  });

  it('does not render the raw task id as visible text (MS Planner alignment)', async () => {
    renderInRouter(<MtTaskRow task={fxTask({ id: 'T-1294' })} />);
    await screen.findByText('Fix login retry storm');
    expect(screen.queryByText('T-1294')).toBeNull();
    // id is still exposed for tooling/tests via data-task-id
    expect(document.querySelector('[data-task-id="T-1294"]')).not.toBeNull();
  });

  it.each([
    [{ percent_complete: 0, is_deferred: false }, 'Not started'],
    [{ percent_complete: 100, is_deferred: false }, 'Done'],
    [{ percent_complete: 40, is_deferred: true }, 'Deferred'],
  ] as const)('derives status %j → %s (no progress enum read)', async (over, label) => {
    renderInRouter(<MtTaskRow task={fxTask(over)} />);
    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it('row is a TanStack Router Link to /planner/plans/$planId/tasks/$taskId', async () => {
    renderInRouter(<MtTaskRow task={fxTask({ id: 'T-1294', plan_id: 'p-q3' })} />);
    const link = await screen.findByRole('link', { name: /fix login retry storm/i });
    expect(link).toHaveAttribute('href', '/planner/plans/p-q3/tasks/T-1294');
  });

  it('clicking the drag handle does NOT trigger navigation', async () => {
    const router = renderInRouter(<MtTaskRow task={fxTask()} />);
    const link = await screen.findByRole('link');
    const handle = link.querySelector('[data-drag-handle]');
    expect(handle).not.toBeNull();
    fireEvent.click(handle as Element);
    expect(router.state.location.pathname).toBe('/');
  });

  it('shows "Xd late" when daysLate > 0', async () => {
    renderInRouter(<MtTaskRow task={fxTask({ daysLate: 6 })} />);
    expect(await screen.findByText(/6d late/)).toBeInTheDocument();
  });

  it('renders only first 2 labels', async () => {
    renderInRouter(
      <MtTaskRow
        task={fxTask({
          labels: [fxLabel('a'), fxLabel('b'), fxLabel('c'), fxLabel('d')],
        })}
      />,
    );
    const container = await screen.findByTestId('task-labels');
    expect(container.children).toHaveLength(2);
  });

  it('due renders in danger color when daysLate > 0', async () => {
    renderInRouter(<MtTaskRow task={fxTask({ daysLate: 3 })} />);
    const due = await screen.findByTestId('task-due');
    expect(due.className).toContain('text-danger');
  });

  it('reads priority_number for the chip (not a dropped priority field)', async () => {
    renderInRouter(<MtTaskRow task={fxTask({ priority_number: 9 })} />);
    expect(await screen.findByText('Low')).toBeInTheDocument();
  });

  it('renders a mini SyncBadge when external_source is m365', async () => {
    renderInRouter(
      <MtTaskRow
        task={fxTask({
          external_source: 'm365',
          sync_status: 'idle',
          external_synced_at: '2026-05-22T00:00:00.000Z',
        })}
      />,
    );
    const badge = await screen.findByLabelText('Sync idle');
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('data-sync-badge-mini')).toBe('true');
  });

  it('does not render a SyncBadge for native tasks', async () => {
    renderInRouter(<MtTaskRow task={fxTask()} />);
    expect(screen.queryByLabelText(/^Sync /)).toBeNull();
  });
});
