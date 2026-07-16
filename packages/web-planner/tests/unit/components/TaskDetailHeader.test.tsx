import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TaskDetailHeader } from '../../../src/components/TaskDetailHeader';

function renderInRouter(node: ReactNode) {
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
  const planRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/planner/plans/$planId',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, groupsRoute, groupDetailRoute, planRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router} />);
}

const baseProps = {
  taskNumber: 42,
  groupName: 'Engineering',
  planName: 'Q3 Launch',
  bucketName: 'In progress',
  titleSlot: <h1>Wire telemetry plumbing</h1>,
  onBack: vi.fn(),
  onAskAgent: vi.fn(),
  onCopyLink: vi.fn(),
  onPrevious: vi.fn(),
  onNext: vi.fn(),
};

describe('TaskDetailHeader', () => {
  it('renders the breadcrumb, T-ID badge, and titleSlot', async () => {
    renderInRouter(<TaskDetailHeader {...baseProps} />);
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    // Without groupId/planId the group and plan crumbs fall back to plain text (no href,
    // no onClick), so only the root "Planner" crumb is a link here.
    expect(within(nav).getByRole('link', { name: 'Planner' })).toHaveAttribute('href', '/planner');
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('Q3 Launch')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(within(nav).getByText('T-42')).toHaveAttribute('aria-current', 'page');
    // Title is owned by the slot — the page passes TaskTitleEditor; tests pass a static h1.
    expect(screen.getByRole('heading', { name: 'Wire telemetry plumbing' })).toBeInTheDocument();
    // Created/updated metadata no longer lives in the header — it moved to the aside footer.
    expect(screen.queryByText(/Created/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument();
  });

  it('links the group and plan crumbs to their real routes when ids are known', async () => {
    renderInRouter(<TaskDetailHeader {...baseProps} groupId="g-1" planId="p-1" />);
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByRole('link', { name: 'Engineering' })).toHaveAttribute(
      'href',
      '/planner/groups/g-1',
    );
    // The plan crumb keeps an honest href even though its click is intercepted (see below),
    // so middle-click / "open in new tab" still reach the board.
    expect(within(nav).getByRole('link', { name: 'Q3 Launch' })).toHaveAttribute(
      'href',
      '/planner/plans/p-1',
    );
  });

  it('renders the Ask agent, Copy link, and prev/next action group', async () => {
    renderInRouter(<TaskDetailHeader {...baseProps} />);
    expect(await screen.findByRole('button', { name: /Ask agent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy link/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Previous task/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next task/i })).toBeInTheDocument();
  });

  // Replaces the old "Back to board" button test: that affordance is gone, and the plan
  // crumb now carries its behavior (return to the board in-place, without a navigation).
  it('calls onBack when the plan breadcrumb is clicked', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderInRouter(<TaskDetailHeader {...baseProps} planId="p-1" onBack={onBack} />);
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    await user.click(within(nav).getByRole('link', { name: 'Q3 Launch' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('invokes onPrevious when K is pressed and onNext when J is pressed', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    renderInRouter(<TaskDetailHeader {...baseProps} onPrevious={onPrevious} onNext={onNext} />);

    await user.keyboard('k');
    expect(onPrevious).toHaveBeenCalledTimes(1);
    await user.keyboard('j');
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('hides the More menu when onDelete is undefined', () => {
    renderInRouter(<TaskDetailHeader {...baseProps} />);
    expect(screen.queryByRole('button', { name: /more actions/i })).not.toBeInTheDocument();
  });

  it('renders only a Delete item in the More menu when onDelete is wired', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderInRouter(<TaskDetailHeader {...baseProps} onDelete={onDelete} />);

    await user.click(await screen.findByRole('button', { name: /more actions/i }));

    const deleteItem = await screen.findByRole('menuitem', { name: /^delete$/i });
    expect(deleteItem).toBeInTheDocument();
    // Duplicate and Archive were removed — they should NOT appear.
    expect(screen.queryByRole('menuitem', { name: /duplicate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /archive/i })).not.toBeInTheDocument();

    await user.click(deleteItem);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('does not hijack J/K while the user is typing in an input', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    renderInRouter(
      <>
        <TaskDetailHeader {...baseProps} onPrevious={onPrevious} onNext={onNext} />
        <input aria-label="search" />
      </>,
    );
    const input = await screen.findByLabelText('search');
    await user.click(input);
    await user.keyboard('jk');
    expect(onPrevious).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });
});
