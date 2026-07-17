import type { MyTasksResult, TaskWithPlan } from '@seta/planner';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { MyTasksGrid } from '../../../../src/components/my-tasks/my-tasks-grid';

afterEach(() => cleanup());

function fxTask(over: Partial<TaskWithPlan> = {}): TaskWithPlan {
  return {
    id: 't1',
    tenant_id: 't',
    plan_id: 'p-q3',
    bucket_id: null,
    title: 'Login storm',
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

function emptyResult(over: Partial<MyTasksResult> = {}): MyTasksResult {
  return {
    late: [],
    dueThisWeek: [],
    inProgress: [],
    notStarted: [],
    recentlyCompleted: [],
    ...over,
  };
}

function renderInRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <>{ui}</>,
  });
  const taskRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/planner/plans/$planId/tasks/$taskId',
    component: () => <div data-testid="task-stub" />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, taskRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('MyTasksGrid', () => {
  it('renders header columns Task, Plan, Priority, Progress, Due, Labels, Assignees', async () => {
    renderInRouter(<MyTasksGrid data={emptyResult({ late: [fxTask()] })} />);
    // Scope to columnheader — the View-options popover keeps its (hidden)
    // radio labels mounted, so bare text queries match twice.
    expect(await screen.findByRole('columnheader', { name: /task/i })).toBeInTheDocument();
    for (const name of [/plan/i, /priority/i, /progress/i, /due/i, /labels/i, /assignees/i]) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();
    }
  });

  it('renders all 5 sections as collapsible groups with every task visible', async () => {
    renderInRouter(
      <MyTasksGrid
        data={emptyResult({
          late: [fxTask({ id: 'L', title: 'Late one' })],
          dueThisWeek: [fxTask({ id: 'W', title: 'Week one' })],
          inProgress: [fxTask({ id: 'P', title: 'Progress one' })],
          notStarted: [fxTask({ id: 'N', title: 'Not started one' })],
          recentlyCompleted: [fxTask({ id: 'D', title: 'Done one' })],
        })}
      />,
    );
    expect(await screen.findByText('Late one')).toBeInTheDocument();
    expect(screen.getByText('Week one')).toBeInTheDocument();
    expect(screen.getByText('Progress one')).toBeInTheDocument();
    expect(screen.getByText('Not started one')).toBeInTheDocument();
    expect(screen.getByText('Done one')).toBeInTheDocument();
    // 5 data rows + 5 group-header rows
    expect(document.querySelectorAll('tbody tr')).toHaveLength(10);
    expect(screen.getByText('Late')).toBeInTheDocument();
    expect(screen.getByText('Due this week')).toBeInTheDocument();
  });

  it('collapsing a group hides its rows; expanding restores them', async () => {
    renderInRouter(
      <MyTasksGrid data={emptyResult({ late: [fxTask({ id: 'L', title: 'Late one' })] })} />,
    );
    await screen.findByText('Late one');
    await userEvent.click(screen.getByRole('button', { name: /collapse group late/i }));
    expect(screen.queryByText('Late one')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /expand group late/i }));
    expect(screen.getByText('Late one')).toBeInTheDocument();
  });

  it('row click fires onOpenTask with the task', async () => {
    const opened: string[] = [];
    renderInRouter(
      <MyTasksGrid
        data={emptyResult({ late: [fxTask({ id: 'T-9', title: 'Peekless' })] })}
        onOpenTask={(t) => opened.push(t.id)}
      />,
    );
    await screen.findByText('Peekless');
    const row = document.querySelector('tr[data-row-id="T-9"]');
    if (!row) throw new Error('row not rendered');
    await userEvent.click(row.querySelector('td:nth-child(3)') as HTMLElement);
    expect(opened).toEqual(['T-9']);
  });

  it('Priority column reads task.priority_number', async () => {
    renderInRouter(<MyTasksGrid data={emptyResult({ late: [fxTask({ priority_number: 1 })] })} />);
    expect(await screen.findByText('Urgent')).toBeInTheDocument();
  });

  it('Progress column reads percent_complete and shows derived status (Done at 100)', async () => {
    renderInRouter(
      <MyTasksGrid data={emptyResult({ late: [fxTask({ percent_complete: 100 })] })} />,
    );
    expect(await screen.findByText('100%')).toBeInTheDocument();
  });

  it('Task title is a Link to /planner/plans/$planId/tasks/$taskId', async () => {
    renderInRouter(
      <MyTasksGrid
        data={emptyResult({
          late: [fxTask({ id: 'T-1', plan_id: 'p-x', title: 'Drag me' })],
        })}
      />,
    );
    const link = await screen.findByRole('link', { name: /drag me/i });
    expect(link).toHaveAttribute('href', '/planner/plans/p-x/tasks/T-1');
  });

  it('does not render a dialog or slide-over', async () => {
    renderInRouter(<MyTasksGrid data={emptyResult({ late: [fxTask()] })} />);
    await screen.findByText('Login storm');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // Row order is read via the title links (role="link"), which render in DOM/body order.
  const rowOrder = () => screen.getAllByRole('link').map((l) => l.textContent);

  it('clicking a header sorts ascending within the group', async () => {
    renderInRouter(
      <MyTasksGrid
        data={emptyResult({
          late: [fxTask({ id: 'A', title: 'Beta' }), fxTask({ id: 'B', title: 'Alpha' })],
        })}
      />,
    );
    await screen.findByText('Beta');
    expect(rowOrder()).toEqual(['Beta', 'Alpha']);
    await userEvent.click(screen.getByText('Task'));
    expect(rowOrder()).toEqual(['Alpha', 'Beta']);
  });

  it('numeric column cycles asc -> desc -> unsorted (Astryx sortable contract)', async () => {
    renderInRouter(
      <MyTasksGrid
        data={emptyResult({
          late: [
            fxTask({ id: 'A', title: 'Mid', percent_complete: 50 }),
            fxTask({ id: 'B', title: 'High', percent_complete: 90 }),
            fxTask({ id: 'C', title: 'Low', percent_complete: 10 }),
          ],
        })}
      />,
    );
    await screen.findByText('Mid');
    expect(rowOrder()).toEqual(['Mid', 'High', 'Low']); // original insertion order
    await userEvent.click(screen.getByText('Progress'));
    expect(rowOrder()).toEqual(['Low', 'Mid', 'High']); // first click => asc (10,50,90)
    await userEvent.click(screen.getByText('Progress'));
    expect(rowOrder()).toEqual(['High', 'Mid', 'Low']); // second click => desc (90,50,10)
    await userEvent.click(screen.getByText('Progress'));
    expect(rowOrder()).toEqual(['Mid', 'High', 'Low']); // third click => unsorted (original)
  });

  it('string column (Task) cycles asc -> desc -> unsorted (restores original order)', async () => {
    renderInRouter(
      <MyTasksGrid
        data={emptyResult({
          late: [
            fxTask({ id: 'A', title: 'Beta' }),
            fxTask({ id: 'B', title: 'Alpha' }),
            fxTask({ id: 'C', title: 'Gamma' }),
          ],
        })}
      />,
    );
    await screen.findByText('Beta');
    expect(rowOrder()).toEqual(['Beta', 'Alpha', 'Gamma']); // original insertion order
    await userEvent.click(screen.getByText('Task'));
    expect(rowOrder()).toEqual(['Alpha', 'Beta', 'Gamma']); // first click => asc
    await userEvent.click(screen.getByText('Task'));
    expect(rowOrder()).toEqual(['Gamma', 'Beta', 'Alpha']); // second click => desc
    await userEvent.click(screen.getByText('Task'));
    expect(rowOrder()).toEqual(['Beta', 'Alpha', 'Gamma']); // third click => unsorted (original)
  });

  it('sorts null due_at last under ascending (missing values sort to the end)', async () => {
    renderInRouter(
      <MyTasksGrid
        data={emptyResult({
          late: [
            fxTask({ id: 'B', title: 'NoDate', due_at: null }),
            fxTask({ id: 'A', title: 'HasDate', due_at: '2024-06-01T00:00:00.000Z' }),
          ],
        })}
      />,
    );
    await screen.findByText('HasDate');
    await userEvent.click(screen.getByText('Due'));
    expect(rowOrder()).toEqual(['HasDate', 'NoDate']);
  });
});
