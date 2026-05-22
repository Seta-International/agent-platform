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
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { MtSection, type MyTasksSection } from './mt-section';
import type { MyTasksRowTask } from './mt-task-row';
import type { PlanGroupData } from './plan-group';

afterEach(() => cleanup());

function fxTask(over: Partial<MyTasksRowTask> = {}): MyTasksRowTask {
  const base: TaskWithPlan = {
    id: 't1',
    tenant_id: 't',
    plan_id: 'p-q3',
    bucket_id: null,
    title: 'Task',
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

function fxSection(over: Partial<MyTasksSection> = {}): MyTasksSection {
  return {
    key: 'late',
    label: 'Late',
    tone: 'danger',
    count: 1,
    open: true,
    groups: [fxGroup()],
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
    component: () => <div />,
  });
  const taskRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/planner/plans/$planId/tasks/$taskId',
    component: () => <div />,
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

describe('MtSection', () => {
  it('renders header with label, count chip, and (when open) the "Sorted by your priority" hint', async () => {
    renderInRouter(<MtSection section={fxSection({ label: 'Late', count: 3 })} />);
    expect(await screen.findByText('Late')).toBeInTheDocument();
    expect(screen.getByTestId('section-count').textContent).toBe('3');
    expect(screen.getByText(/sorted by your priority/i)).toBeInTheDocument();
  });

  it('renders optional hint with leading "·"', async () => {
    renderInRouter(<MtSection section={fxSection({ hint: 'last 14 days' })} />);
    expect(await screen.findByText(/last 14 days/)).toBeInTheDocument();
  });

  it('renders one PlanGroup per group when open', async () => {
    renderInRouter(
      <MtSection
        section={fxSection({
          groups: [
            fxGroup({ plan: { id: 'p-a', name: 'Plan A', color: '#0047FF' } }),
            fxGroup({ plan: { id: 'p-b', name: 'Plan B', color: '#0047FF' } }),
          ],
        })}
      />,
    );
    expect(await screen.findByText('Plan A')).toBeInTheDocument();
    expect(screen.getByText('Plan B')).toBeInTheDocument();
  });

  it('clicking the header toggles open/closed and hides groups when closed', async () => {
    renderInRouter(<MtSection section={fxSection({ open: true, groups: [fxGroup()] })} />);
    expect(await screen.findByText('Q3 Launch')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Late'));
    expect(screen.queryByText('Q3 Launch')).not.toBeInTheDocument();
  });

  it('hides "Sorted by your priority" when closed', async () => {
    renderInRouter(<MtSection section={fxSection({ open: false })} />);
    await screen.findByText('Late');
    expect(screen.queryByText(/sorted by your priority/i)).not.toBeInTheDocument();
  });

  it('renders the tone dot with class dot--<tone>', async () => {
    renderInRouter(<MtSection section={fxSection({ tone: 'success' })} />);
    const dot = await screen.findByTestId('section-tone-dot');
    expect(dot.className).toContain('dot');
    expect(dot.className).toContain('dot--success');
  });
});
