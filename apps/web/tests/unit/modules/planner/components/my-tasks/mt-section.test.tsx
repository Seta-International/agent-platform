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
import {
  MtSection,
  type MyTasksSection,
} from '../../../../../../src/modules/planner/components/my-tasks/mt-section';
import type { MyTasksRowTask } from '../../../../../../src/modules/planner/components/my-tasks/mt-task-row';

afterEach(() => cleanup());

function fxTask(over: Partial<MyTasksRowTask> = {}): MyTasksRowTask {
  const base: TaskWithPlan = {
    id: 't1',
    tenant_id: 't',
    plan_id: 'p-q3',
    bucket_id: null,
    title: 'Task',
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
  };
  return { ...base, ...over };
}

function fxSection(over: Partial<MyTasksSection> = {}): MyTasksSection {
  return {
    key: 'late',
    label: 'Late',
    tone: 'danger',
    count: 1,
    open: true,
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

  it('renders a single column-header strip per section (Task/Plan/Priority/Progress/Due/Labels/Assignees)', async () => {
    renderInRouter(<MtSection section={fxSection({ open: true })} />);
    const cols = await screen.findByTestId('mt-section-columns');
    expect(cols.textContent).toContain('Task');
    expect(cols.textContent).toContain('Plan');
    expect(cols.textContent).toContain('Priority');
    expect(cols.textContent).toContain('Progress');
    expect(cols.textContent).toContain('Due');
    expect(cols.textContent).toContain('Labels');
    expect(cols.textContent).toContain('Assignees');
  });

  it('hides the column-header strip when section has zero tasks', async () => {
    renderInRouter(<MtSection section={fxSection({ open: true, count: 0, tasks: [] })} />);
    await screen.findByText('Late');
    expect(screen.queryByTestId('mt-section-columns')).toBeNull();
  });

  it('renders one row per task when open', async () => {
    renderInRouter(
      <MtSection
        section={fxSection({
          count: 2,
          tasks: [fxTask({ id: 't1', title: 'Alpha' }), fxTask({ id: 't2', title: 'Beta' })],
        })}
      />,
    );
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('wraps tasks in a section-scoped Droppable (droppableId is `mt:<sectionKey>`)', async () => {
    renderInRouter(
      <MtSection section={fxSection({ key: 'late', tasks: [fxTask({ title: 'Alpha row' })] })} />,
    );
    await screen.findByText('Alpha row');
    const droppable = document.querySelector('[data-rfd-droppable-id]');
    expect(droppable?.getAttribute('data-rfd-droppable-id')).toBe('mt:late');
  });

  it('clicking the header toggles open/closed and hides tasks when closed', async () => {
    renderInRouter(
      <MtSection
        section={fxSection({ open: true, tasks: [fxTask({ id: 't1', title: 'Alpha row' })] })}
      />,
    );
    expect(await screen.findByText('Alpha row')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Late'));
    expect(screen.queryByText('Alpha row')).not.toBeInTheDocument();
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
