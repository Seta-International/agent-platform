import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PlanPageHeader } from './plan-page-header';

function renderWithRouter(node: ReactNode) {
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

describe('PlanPageHeader — sync extensions', () => {
  it('renders SyncBadge when plan is linked to m365', async () => {
    renderWithRouter(
      <PlanPageHeader
        planName="Q3 Launch"
        bucketCount={3}
        taskCount={5}
        external_source="m365"
        syncStatus="idle"
        externalSyncedAt={null}
      />,
    );
    expect(await screen.findByText(/synced/i)).toBeInTheDocument();
  });

  it('does not render SyncBadge for native plans', async () => {
    renderWithRouter(
      <PlanPageHeader
        planName="Q3 Launch"
        bucketCount={3}
        taskCount={5}
        external_source="native"
      />,
    );
    await screen.findByRole('heading', { name: 'Q3 Launch' });
    expect(
      screen.queryByText(/synced|pulling|pushing|conflict|sync failed/i),
    ).not.toBeInTheDocument();
  });

  it('shows "Refresh sync" in the overflow menu and fires onRefreshSync', async () => {
    const onRefreshSync = vi.fn();
    renderWithRouter(
      <PlanPageHeader
        planName="Q3 Launch"
        bucketCount={3}
        taskCount={5}
        external_source="m365"
        syncStatus="idle"
        externalSyncedAt={null}
        onRefreshSync={onRefreshSync}
      />,
    );
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Q3 Launch' });
    await user.click(screen.getByRole('button', { name: /plan actions/i }));
    const item = await screen.findByRole('menuitem', { name: /refresh sync/i });
    await user.click(item);
    expect(onRefreshSync).toHaveBeenCalledTimes(1);
  });

  it('shows "Resolve conflicts (N)…" when in conflict + count provided and fires callback', async () => {
    const onOpenConflictDialog = vi.fn();
    renderWithRouter(
      <PlanPageHeader
        planName="Q3 Launch"
        bucketCount={3}
        taskCount={5}
        external_source="m365"
        syncStatus="conflict"
        externalSyncedAt={null}
        conflictCount={3}
        onOpenConflictDialog={onOpenConflictDialog}
      />,
    );
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Q3 Launch' });
    await user.click(screen.getByRole('button', { name: /plan actions/i }));
    const item = await screen.findByRole('menuitem', { name: /resolve conflicts \(3\)/i });
    await user.click(item);
    expect(onOpenConflictDialog).toHaveBeenCalledTimes(1);
  });

  it('shows "Resolve conflicts…" with no count when conflictCount is null', async () => {
    renderWithRouter(
      <PlanPageHeader
        planName="Q3 Launch"
        bucketCount={3}
        taskCount={5}
        external_source="m365"
        syncStatus="conflict"
        externalSyncedAt={null}
        conflictCount={null}
        onOpenConflictDialog={() => {}}
      />,
    );
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Q3 Launch' });
    await user.click(screen.getByRole('button', { name: /plan actions/i }));
    const item = await screen.findByRole('menuitem', { name: /resolve conflicts/i });
    expect(item.textContent).not.toMatch(/\(\d+\)/);
  });

  it('does NOT show "Resolve conflicts" when syncStatus is idle', async () => {
    renderWithRouter(
      <PlanPageHeader
        planName="Q3 Launch"
        bucketCount={3}
        taskCount={5}
        external_source="m365"
        syncStatus="idle"
        externalSyncedAt={null}
        onOpenConflictDialog={() => {}}
        onRefreshSync={() => {}}
      />,
    );
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Q3 Launch' });
    await user.click(screen.getByRole('button', { name: /plan actions/i }));
    expect(screen.queryByRole('menuitem', { name: /resolve conflicts/i })).not.toBeInTheDocument();
  });

  it('shows "Open in M365 Planner" as an anchor with correct href', async () => {
    renderWithRouter(
      <PlanPageHeader
        planName="Q3 Launch"
        bucketCount={3}
        taskCount={5}
        external_source="m365"
        syncStatus="idle"
        externalSyncedAt={null}
        externalId="planner-external-id"
      />,
    );
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Q3 Launch' });
    await user.click(screen.getByRole('button', { name: /plan actions/i }));
    const link = await screen.findByRole('menuitem', { name: /open in m365 planner/i });
    expect(link.tagName.toLowerCase()).toBe('a');
    expect(link).toHaveAttribute(
      'href',
      'https://tasks.office.com/Home/Planner/#/plantaskboard?planId=planner-external-id',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('shows "Unlink from M365…" when canManage + onUnlinkFromM365 provided', async () => {
    const onUnlink = vi.fn();
    renderWithRouter(
      <PlanPageHeader
        planName="Q3 Launch"
        bucketCount={3}
        taskCount={5}
        external_source="m365"
        syncStatus="idle"
        externalSyncedAt={null}
        canManage
        onUnlinkFromM365={onUnlink}
      />,
    );
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Q3 Launch' });
    await user.click(screen.getByRole('button', { name: /plan actions/i }));
    const item = await screen.findByRole('menuitem', { name: /unlink from m365/i });
    await user.click(item);
    expect(onUnlink).toHaveBeenCalledTimes(1);
  });

  it('does NOT show "Unlink from M365" when canManage is false', async () => {
    renderWithRouter(
      <PlanPageHeader
        planName="Q3 Launch"
        bucketCount={3}
        taskCount={5}
        external_source="m365"
        syncStatus="idle"
        externalSyncedAt={null}
        canManage={false}
        onUnlinkFromM365={() => {}}
        onRefreshSync={() => {}}
      />,
    );
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Q3 Launch' });
    await user.click(screen.getByRole('button', { name: /plan actions/i }));
    expect(screen.queryByRole('menuitem', { name: /unlink from m365/i })).not.toBeInTheDocument();
  });
});
