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
import { GroupsGrid } from './GroupsGrid';

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

function GridWithRouter({
  groups,
}: {
  groups: ReadonlyArray<ReturnType<typeof makeGroupWithCounts>>;
}) {
  return <GroupsGrid groups={groups} />;
}

describe('GroupsGrid', () => {
  it('renders a card per group', async () => {
    const groups = [
      makeGroupWithCounts({ id: 'g1', name: 'Engineering', theme: 'blue' }),
      makeGroupWithCounts({ id: 'g2', name: 'Marketing', theme: 'orange' }),
    ];
    renderInRouter(<GridWithRouter groups={groups} />);
    expect(await screen.findByText('Engineering')).toBeInTheDocument();
    expect(await screen.findByText('Marketing')).toBeInTheDocument();
  });

  it('shows plan and member counts', async () => {
    const g = makeGroupWithCounts({ name: 'X', plan_count: 5, member_count: 12 });
    renderInRouter(<GridWithRouter groups={[g]} />);
    expect(await screen.findByText(/5 plans · 12 members/)).toBeInTheDocument();
  });

  it("renders 'No description' placeholder when description is null", async () => {
    const g = makeGroupWithCounts({ description: null });
    renderInRouter(<GridWithRouter groups={[g]} />);
    expect(await screen.findByText(/No description/)).toBeInTheDocument();
  });

  it('links each card to the detail route', async () => {
    const g = makeGroupWithCounts({ id: 'g-link', name: 'Linked' });
    renderInRouter(<GridWithRouter groups={[g]} />);
    const link = await screen.findByRole('link', { name: /Linked/ });
    expect(link.getAttribute('href')).toContain('g-link');
  });

  it('renders empty when groups array is empty', () => {
    const { container } = renderInRouter(<GridWithRouter groups={[]} />);
    expect(container.querySelector('a')).toBeNull();
  });
});
