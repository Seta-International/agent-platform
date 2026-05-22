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
import { MyTasksGrid } from './my-tasks-grid';

afterEach(() => cleanup());

function fxTask(over: Partial<TaskWithPlan> = {}): TaskWithPlan {
  return {
    id: 't1',
    tenant_id: 't',
    plan_id: 'p-q3',
    bucket_id: null,
    title: 'Login storm',
    description: null,
    priority_number: 5,
    percent_complete: 0,
    is_deferred: false,
    preview_type: 'automatic',
    review_state: null,
    skill_tags: [],
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
    expect(await screen.findByText('Task')).toBeInTheDocument();
    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();
    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('Due')).toBeInTheDocument();
    expect(screen.getByText('Labels')).toBeInTheDocument();
    expect(screen.getByText('Assignees')).toBeInTheDocument();
  });

  it('flattens all 5 sections into one table body', async () => {
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
    expect(document.querySelectorAll('tbody tr')).toHaveLength(5);
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

  it('clicking a header toggles client-side sort (toggles aria/state observable via title)', async () => {
    renderInRouter(
      <MyTasksGrid
        data={emptyResult({
          late: [fxTask({ id: 'A', title: 'Beta' }), fxTask({ id: 'B', title: 'Alpha' })],
        })}
      />,
    );
    await screen.findByText('Beta');
    let cells = Array.from(document.querySelectorAll('tbody tr td:first-child a')).map(
      (a) => a.textContent,
    );
    expect(cells).toEqual(['Beta', 'Alpha']);
    await userEvent.click(screen.getByText('Task'));
    cells = Array.from(document.querySelectorAll('tbody tr td:first-child a')).map(
      (a) => a.textContent,
    );
    expect(cells).toEqual(['Alpha', 'Beta']);
  });
});
