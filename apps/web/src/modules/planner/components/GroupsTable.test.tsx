import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { makeGroupWithCounts } from '../testing/fixtures';
import { GroupsTable } from './GroupsTable';

function renderInRouter(node: ReactNode) {
  const rootRoute = createRootRoute({ component: () => node });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => node,
  });
  const groupDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/planner/groups/$groupId',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, groupDetailRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router} />);
}

function TableWithRouter({
  groups,
}: {
  groups: ReadonlyArray<ReturnType<typeof makeGroupWithCounts>>;
}) {
  return <GroupsTable groups={groups} />;
}

describe('GroupsTable', () => {
  it('renders the column headers', async () => {
    renderInRouter(<TableWithRouter groups={[]} />);
    expect(await screen.findByText(/Group/)).toBeInTheDocument();
    expect(screen.getByText(/Owner/)).toBeInTheDocument();
    expect(screen.getByText(/Plans/)).toBeInTheDocument();
    expect(screen.getByText(/Members/)).toBeInTheDocument();
    expect(screen.getByText(/Visibility/)).toBeInTheDocument();
    expect(screen.getByText(/Activity/)).toBeInTheDocument();
  });

  it('renders one row per group with key fields', async () => {
    const g = makeGroupWithCounts({
      name: 'Engineering',
      description: 'Platform work',
      theme: 'blue',
      plan_count: 4,
      member_count: 12,
      visibility: 'private',
      owner_display_name: 'Jane Doe',
    });
    renderInRouter(<TableWithRouter groups={[g]} />);
    expect(await screen.findByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('Platform work')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Private')).toBeInTheDocument();
  });

  it('row links to the detail page via groupId', async () => {
    const g = makeGroupWithCounts({ id: 'g-eng', name: 'Engineering' });
    renderInRouter(<TableWithRouter groups={[g]} />);
    const link = await screen.findByRole('link', { name: /Engineering/ });
    expect(link.getAttribute('href')).toContain('g-eng');
  });

  it('renders em-dash for groups without an owner_display_name', async () => {
    const g = makeGroupWithCounts({ owner_display_name: null });
    renderInRouter(<TableWithRouter groups={[g]} />);
    await screen.findByRole('link');
    // Both the avatar fallback and the owner text span show '—' when null
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('uses "Workspace" label for public visibility', async () => {
    const g = makeGroupWithCounts({ visibility: 'public' });
    renderInRouter(<TableWithRouter groups={[g]} />);
    expect(await screen.findByText('Workspace')).toBeInTheDocument();
  });

  it('shows refresh glyph for m365 group', async () => {
    const g = makeGroupWithCounts({ external_source: 'm365', external_id: 'ext-1' });
    renderInRouter(<TableWithRouter groups={[g]} />);
    await screen.findByRole('link');
    expect(screen.getByLabelText('Synced from M365')).toBeInTheDocument();
  });
});
