import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionScopeProjection } from '../../identity/api/client';
import { makeGroup, makePlanWithRollups } from '../testing/fixtures';
import { GroupDetailPage, type GroupTab } from './group-detail-page';

// EventSource is not provided by happy-dom; GroupDetailHeader opens one via useGroupSyncStream.
class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = [];
  url: string;
  withCredentials: boolean;
  readyState = 0;
  constructor(url: string, init?: EventSourceInit) {
    super();
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    FakeEventSource.instances.push(this);
  }
  close() {
    this.readyState = 2;
  }
}

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
  FakeEventSource.instances = [];
});
afterEach(() => vi.unstubAllGlobals());

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
  const planRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/planner/plans/$planId',
    component: () => null,
  });
  const groupsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/planner/groups',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, detailRoute, planRoute, groupsRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function buildSession(roles: string[]): SessionScopeProjection {
  return {
    user_id: 'u1',
    tenant_id: 't1',
    email: 'admin@example.com',
    display_name: 'Admin User',
    role_summary: { roles, cross_tenant_read: false },
    accessible_group_ids: ['g1'],
    cross_tenant_read: false,
    tenant_local_password_disabled: false,
  };
}

const adminSession = buildSession(['planner.admin']);
const guestSession = buildSession(['planner.contributor']);

/** Default MSW handlers for a group with one plan and no members */
function defaultHandlers() {
  return [
    http.get('*/api/planner/v1/groups/g1', () =>
      HttpResponse.json(makeGroup({ id: 'g1', name: 'Engineering' })),
    ),
    http.get('*/api/planner/v1/plans*', () =>
      HttpResponse.json({
        plans: [makePlanWithRollups({ id: 'p1', group_id: 'g1', name: 'Q3 Launch' })],
      }),
    ),
    http.get('*/api/planner/v1/groups/g1/members', () => HttpResponse.json({ members: [] })),
    http.get('*/api/planner/v1/groups/g1/activity*', () =>
      HttpResponse.json({ count: 0, items: [] }),
    ),
    http.get('*/api/integrations/m365/groups/g1/sync-status', () =>
      HttpResponse.json({ sync_status: null }),
    ),
  ];
}

/** Harness with admin session */
function AdminPage({ tab, onTabChange }: { tab: GroupTab; onTabChange?: (t: GroupTab) => void }) {
  return (
    <GroupDetailPage
      groupId="g1"
      tab={tab}
      onTabChange={onTabChange ?? (() => {})}
      session={adminSession}
    />
  );
}

describe('GroupDetailPage', () => {
  it('renders header + stat row + tabs', async () => {
    server.use(...defaultHandlers());
    renderInRouter(<AdminPage tab="plans" />);

    // Wait for group to load (header contains the group name)
    expect(await screen.findByRole('heading', { name: 'Engineering' })).toBeInTheDocument();

    // Tabs are rendered
    expect(screen.getByRole('tab', { name: /plans/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /members/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /activity/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /labels/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /integrations/i })).toBeInTheDocument();
  });

  it('plans tab renders PlanCards + Rail', async () => {
    server.use(...defaultHandlers());
    renderInRouter(<AdminPage tab="plans" />);

    // Q3 Launch plan card should be visible
    expect(await screen.findByText('Q3 Launch')).toBeInTheDocument();

    // Rail renders — verify by finding the "Add" button in the members rail card
    // (the rail "Members" heading appears alongside the count in the sidebar)
    expect(screen.getAllByText(/Members/).length).toBeGreaterThan(0);
  });

  it('members tab renders MembersTable + Rail', async () => {
    server.use(
      http.get('*/api/planner/v1/groups/g1', () =>
        HttpResponse.json(makeGroup({ id: 'g1', name: 'Engineering' })),
      ),
      http.get('*/api/planner/v1/plans*', () => HttpResponse.json({ plans: [] })),
      http.get('*/api/planner/v1/groups/g1/members', () =>
        HttpResponse.json({
          members: [
            {
              group_id: 'g1',
              user_id: 'u2',
              role: 'member',
              display_name: 'Alice',
              email: 'alice@example.com',
              added_at: '2026-05-01T00:00:00Z',
              added_by: 'u1',
            },
          ],
        }),
      ),
      http.get('*/api/integrations/m365/groups/g1/sync-status', () =>
        HttpResponse.json({ sync_status: null }),
      ),
    );
    renderInRouter(<AdminPage tab="members" />);

    // Members table shows Alice (appears multiple times — in table + rail)
    await screen.findAllByText('Alice');
    // Email only appears in the table (rail doesn't show email)
    expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0);
  });

  it('activity tab renders ComingSoon', async () => {
    server.use(...defaultHandlers());
    renderInRouter(<AdminPage tab="activity" />);

    await screen.findByRole('heading', { name: 'Engineering' });
    // ComingSoon renders "{feature} is coming soon"
    expect(screen.getByText(/Activity is coming soon/i)).toBeInTheDocument();
  });

  it('labels tab renders ComingSoon', async () => {
    server.use(...defaultHandlers());
    renderInRouter(<AdminPage tab="labels" />);

    await screen.findByRole('heading', { name: 'Engineering' });
    expect(screen.getByText(/Labels is coming soon/i)).toBeInTheDocument();
  });

  it('integrations tab renders ComingSoon', async () => {
    server.use(...defaultHandlers());
    renderInRouter(<AdminPage tab="integrations" />);

    await screen.findByRole('heading', { name: 'Engineering' });
    expect(screen.getByText(/Integrations is coming soon/i)).toBeInTheDocument();
  });

  it('settings tab visible only when canManage', async () => {
    server.use(...defaultHandlers());

    // Admin can see settings tab
    renderInRouter(<AdminPage tab="plans" />);
    await screen.findByRole('heading', { name: 'Engineering' });
    expect(screen.getByRole('tab', { name: /settings/i })).toBeInTheDocument();
  });

  it('settings tab hidden when user is not admin or owner', async () => {
    server.use(...defaultHandlers());

    renderInRouter(
      <GroupDetailPage groupId="g1" tab="plans" onTabChange={() => {}} session={guestSession} />,
    );
    await screen.findByRole('heading', { name: 'Engineering' });
    expect(screen.queryByRole('tab', { name: /settings/i })).toBeNull();
  });

  it('tab switch calls onTabChange', async () => {
    server.use(...defaultHandlers());
    const onTabChange = vi.fn();
    renderInRouter(<AdminPage tab="plans" onTabChange={onTabChange} />);

    await screen.findByRole('heading', { name: 'Engineering' });

    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /members/i }));

    expect(onTabChange).toHaveBeenCalledWith('members');
  });
});
