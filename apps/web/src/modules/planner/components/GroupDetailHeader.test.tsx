import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { makeGroup } from '../testing/fixtures';
import { GroupDetailHeader } from './GroupDetailHeader';

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
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, groupsRoute, groupDetailRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router} />);
}

const baseGroup = makeGroup({
  id: 'g1',
  name: 'Engineering',
  theme: 'blue',
  visibility: 'private',
  description: 'Platform work',
  created_at: '2026-03-15T00:00:00Z',
});

const baseProps = {
  group: baseGroup,
  canManage: true,
  onRenameClick: vi.fn(),
  onInviteClick: vi.fn(),
  onCreatePlanClick: vi.fn(),
  onMenuAction: vi.fn(),
};

describe('GroupDetailHeader', () => {
  it('renders the back link, breadcrumb, tile, and title', async () => {
    renderInRouter(<GroupDetailHeader {...baseProps} />);
    expect(await screen.findByRole('link', { name: /Back to Groups/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Engineering' })).toBeInTheDocument();
  });

  it('renders Private visibility pill', async () => {
    renderInRouter(<GroupDetailHeader {...baseProps} />);
    await screen.findByRole('heading', { name: 'Engineering' });
    expect(screen.getByText('Private')).toBeInTheDocument();
  });

  it('renders Public when visibility=public', async () => {
    renderInRouter(
      <GroupDetailHeader {...baseProps} group={{ ...baseGroup, visibility: 'public' }} />,
    );
    await screen.findByRole('heading', { name: 'Engineering' });
    expect(screen.getByText('Public')).toBeInTheDocument();
  });

  it('hides the Invite and rename pencil when canManage=false', async () => {
    renderInRouter(<GroupDetailHeader {...baseProps} canManage={false} />);
    await screen.findByRole('heading', { name: 'Engineering' });
    expect(screen.queryByRole('button', { name: /Invite/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rename group/i })).not.toBeInTheDocument();
  });

  it('calls onRenameClick when the rename pencil is clicked', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onRenameClick = vi.fn();
    renderInRouter(<GroupDetailHeader {...baseProps} onRenameClick={onRenameClick} />);
    await user.click(await screen.findByRole('button', { name: /Rename group/i }));
    expect(onRenameClick).toHaveBeenCalled();
  });

  it('calls onCreatePlanClick when "New plan" is clicked', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onCreatePlanClick = vi.fn();
    renderInRouter(<GroupDetailHeader {...baseProps} onCreatePlanClick={onCreatePlanClick} />);
    await user.click(await screen.findByRole('button', { name: /New plan/ }));
    expect(onCreatePlanClick).toHaveBeenCalled();
  });

  it('renders an overflow menu with Archive and Delete', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onMenuAction = vi.fn();
    renderInRouter(<GroupDetailHeader {...baseProps} onMenuAction={onMenuAction} />);
    await user.click(await screen.findByRole('button', { name: /more/i }));
    await user.click(screen.getByRole('menuitem', { name: /Archive/ }));
    expect(onMenuAction).toHaveBeenCalledWith('archive');
  });

  it('shows description when provided', async () => {
    renderInRouter(<GroupDetailHeader {...baseProps} />);
    await screen.findByRole('heading', { name: 'Engineering' });
    expect(screen.getByText('Platform work')).toBeInTheDocument();
  });

  it('shows em-dash when description is null', async () => {
    renderInRouter(
      <GroupDetailHeader {...baseProps} group={{ ...baseGroup, description: null }} />,
    );
    await screen.findByRole('heading', { name: 'Engineering' });
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows the formatted creation date', async () => {
    renderInRouter(<GroupDetailHeader {...baseProps} />);
    await screen.findByRole('heading', { name: 'Engineering' });
    expect(screen.getByText(/Created Mar 2026/)).toBeInTheDocument();
  });
});
