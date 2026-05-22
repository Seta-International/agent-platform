import { DragDropContext } from '@hello-pangea/dnd';
import type { TaskWithPlan } from '@seta/planner';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { MyTasksRowTask } from './mt-task-row';
import { PlanGroup, type PlanGroupData } from './plan-group';

afterEach(() => cleanup());

function fxTask(over: Partial<MyTasksRowTask> = {}): MyTasksRowTask {
  const base: TaskWithPlan = {
    id: 't1',
    tenant_id: 't',
    plan_id: 'p-q3',
    bucket_id: null,
    title: 'Task one',
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
  };
  return { ...base, ...over };
}

function fxGroup(over: Partial<PlanGroupData> = {}): PlanGroupData {
  return {
    plan: { id: 'p-q3', name: 'Q3 Launch', color: '#0047FF' },
    group: { id: 'g1', name: 'Engineering' },
    tasks: [fxTask()],
    ...over,
  };
}

function renderInRouter(ui: ReactNode) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <>{ui}</>,
  });
  const planRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/planner/plans/$planId',
    component: () => <div data-testid="plan-stub" />,
  });
  const taskRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/planner/plans/$planId/tasks/$taskId',
    component: () => <div data-testid="task-stub" />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, planRoute, taskRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(
    <DragDropContext onDragEnd={() => undefined}>
      <RouterProvider router={router} />
    </DragDropContext>,
  );
  return router;
}

describe('PlanGroup', () => {
  it('renders the plan strip header with rail, plan name, group name, count, Open-plan link', async () => {
    renderInRouter(<PlanGroup sectionKey="late" group={fxGroup()} first />);
    expect(await screen.findByText('Q3 Launch')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText(/1 task\b/)).toBeInTheDocument();
    expect(screen.getByText(/open plan/i)).toBeInTheDocument();
    const rail = screen.getByTestId('plan-color-rail');
    expect(rail.style.background.toLowerCase()).toContain('#0047ff');
  });

  it('renders the column-key row', async () => {
    renderInRouter(<PlanGroup sectionKey="late" group={fxGroup()} />);
    expect(await screen.findByText('Task')).toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();
    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('Due')).toBeInTheDocument();
    expect(screen.getByText('Labels')).toBeInTheDocument();
    expect(screen.getByText('Assignees')).toBeInTheDocument();
  });

  it('renders one MtTaskRow per task', async () => {
    renderInRouter(
      <PlanGroup
        sectionKey="late"
        group={fxGroup({
          tasks: [
            fxTask({ id: 't1', title: 'One' }),
            fxTask({ id: 't2', title: 'Two' }),
            fxTask({ id: 't3', title: 'Three' }),
          ],
        })}
      />,
    );
    expect(await screen.findByText('One')).toBeInTheDocument();
    expect(screen.getByText('Two')).toBeInTheDocument();
    expect(screen.getByText('Three')).toBeInTheDocument();
  });

  it('singularizes "1 task" vs "N tasks"', async () => {
    const { unmount } = render(<div />);
    unmount();
    renderInRouter(<PlanGroup sectionKey="late" group={fxGroup({ tasks: [fxTask()] })} />);
    expect(await screen.findByText(/^1 task$/)).toBeInTheDocument();
    cleanup();
    renderInRouter(
      <PlanGroup
        sectionKey="late"
        group={fxGroup({ tasks: [fxTask({ id: 'a' }), fxTask({ id: 'b' })] })}
      />,
    );
    expect(await screen.findByText(/^2 tasks$/)).toBeInTheDocument();
  });

  it('Open-plan link href is /planner/plans/$planId', async () => {
    renderInRouter(
      <PlanGroup
        sectionKey="late"
        group={fxGroup({ plan: { id: 'p-q3', name: 'Q3 Launch', color: '#0047FF' } })}
      />,
    );
    const link = await screen.findByRole('link', { name: /open plan/i });
    expect(link).toHaveAttribute('href', '/planner/plans/p-q3');
  });

  it('wraps task rows in a Droppable with droppableId `mt:<sectionKey>:<planId>`', async () => {
    renderInRouter(
      <PlanGroup
        sectionKey="late"
        group={fxGroup({
          plan: { id: 'p-q3', name: 'Q3 Launch', color: '#0047FF' },
          tasks: [fxTask({ id: 't1' })],
        })}
      />,
    );
    expect(await screen.findByText('Task one')).toBeInTheDocument();
    const droppable = document.querySelector('[data-rfd-droppable-id]');
    expect(droppable?.getAttribute('data-rfd-droppable-id')).toBe('mt:late:p-q3');
  });

  it('renders one Draggable per task with the task id as draggableId', async () => {
    renderInRouter(
      <PlanGroup
        sectionKey="week"
        group={fxGroup({
          tasks: [fxTask({ id: 't1', title: 'A' }), fxTask({ id: 't2', title: 'B' })],
        })}
      />,
    );
    expect(await screen.findByText('A')).toBeInTheDocument();
    const draggables = document.querySelectorAll('[data-rfd-draggable-id]');
    const ids = Array.from(draggables).map((d) => d.getAttribute('data-rfd-draggable-id'));
    expect(ids).toEqual(['t1', 't2']);
  });

  it('does NOT virtualize when tasks.length < 10', async () => {
    renderInRouter(
      <PlanGroup
        sectionKey="late"
        group={fxGroup({
          tasks: Array.from({ length: 9 }, (_, i) => fxTask({ id: `t${i}`, title: `Task ${i}` })),
        })}
      />,
    );
    expect(await screen.findByText('Task 0')).toBeInTheDocument();
    expect(document.querySelector('[data-testid="plan-group-rows-virtualized"]')).toBeNull();
  });

  it('virtualizes when tasks.length >= 10', async () => {
    renderInRouter(
      <PlanGroup
        sectionKey="late"
        group={fxGroup({
          tasks: Array.from({ length: 30 }, (_, i) => fxTask({ id: `t${i}`, title: `Task ${i}` })),
        })}
      />,
    );
    expect(await screen.findByTestId('plan-group-rows-virtualized')).toBeInTheDocument();
  });
});
