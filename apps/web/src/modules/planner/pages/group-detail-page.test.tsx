import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { makeGroup, makePlan } from '../testing/fixtures';
import { GroupDetailPage, type GroupDetailSession, type GroupDetailTab } from './group-detail-page';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderInRouter(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({ component: () => node });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => node,
  });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/planner/groups/$groupId',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, detailRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function buildSession(roles: string[], accessibleGroupIds: string[]): GroupDetailSession {
  return {
    role_summary: { roles, cross_tenant_read: false },
    accessible_group_ids: accessibleGroupIds,
  };
}

function PageHarness({ tab }: { tab: GroupDetailTab }) {
  return (
    <GroupDetailPage
      groupId="g1"
      tab={tab}
      onTabChange={() => {}}
      session={buildSession(['planner.admin'], ['g1'])}
    />
  );
}

describe('GroupDetailPage', () => {
  it('renders plans tab by default', async () => {
    server.use(
      http.get('*/api/planner/v1/groups/g1', () =>
        HttpResponse.json(makeGroup({ id: 'g1', name: 'Eng' })),
      ),
      http.get('*/api/planner/v1/plans', () =>
        HttpResponse.json({ plans: [makePlan({ id: 'p1', group_id: 'g1', name: 'Q3' })] }),
      ),
      http.get('*/api/planner/v1/groups/g1/members', () => HttpResponse.json({ members: [] })),
    );
    renderInRouter(<PageHarness tab="plans" />);
    expect(await screen.findByText('Q3')).toBeInTheDocument();
  });

  it('renders members on tab=members', async () => {
    server.use(
      http.get('*/api/planner/v1/groups/g1', () =>
        HttpResponse.json(makeGroup({ id: 'g1', name: 'Eng' })),
      ),
      http.get('*/api/planner/v1/plans', () => HttpResponse.json({ plans: [] })),
      http.get('*/api/planner/v1/groups/g1/members', () =>
        HttpResponse.json({
          members: [
            {
              group_id: 'g1',
              user_id: 'u1',
              display_name: 'Alice',
              email: 'a@x',
              added_at: '2026-05-01T00:00:00Z',
              added_by: '',
            },
          ],
        }),
      ),
    );
    renderInRouter(<PageHarness tab="members" />);
    expect(await screen.findByText('Alice')).toBeInTheDocument();
  });

  it('hides settings tab when session lacks planner.group management', async () => {
    server.use(
      http.get('*/api/planner/v1/groups/g1', () =>
        HttpResponse.json(makeGroup({ id: 'g1', name: 'Eng' })),
      ),
      http.get('*/api/planner/v1/plans', () => HttpResponse.json({ plans: [] })),
      http.get('*/api/planner/v1/groups/g1/members', () => HttpResponse.json({ members: [] })),
    );
    renderInRouter(
      <GroupDetailPage
        groupId="g1"
        tab="plans"
        onTabChange={() => {}}
        session={buildSession(['planner.contributor'], ['g1'])}
      />,
    );
    await screen.findByText('Eng');
    expect(screen.queryByRole('tab', { name: /settings/i })).toBeNull();
  });
});
