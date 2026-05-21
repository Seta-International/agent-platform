import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeGroupWithCounts } from '../testing/fixtures';
import { GroupsPage } from './groups-page';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
});
afterAll(() => server.close());

// Handlers for the withCounts endpoint
function makeGroupsHandler(groups: ReturnType<typeof makeGroupWithCounts>[]) {
  return http.get('*/api/planner/v1/groups', ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get('withCounts') !== 'true') {
      return HttpResponse.json({ groups: [] });
    }
    return HttpResponse.json({ groups });
  });
}

function makeGroupsHandlerWithDelay(groups: ReturnType<typeof makeGroupWithCounts>[]) {
  return http.get('*/api/planner/v1/groups', async ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get('withCounts') !== 'true') {
      return HttpResponse.json({ groups: [] });
    }
    await delay('infinite');
    return HttpResponse.json({ groups });
  });
}

function makeGroupsErrorHandler() {
  return http.get('*/api/planner/v1/groups', () =>
    HttpResponse.json({ error: 'SERVER' }, { status: 500 }),
  );
}

// Also need to handle the POST /api/planner/v1/groups for CreateGroupDialog
function makeCreateGroupHandler() {
  return http.post('*/api/planner/v1/groups', () =>
    HttpResponse.json(makeGroupWithCounts({ id: 'new-group', name: 'New Group' }), {
      status: 201,
    }),
  );
}

function renderWithRouter(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({ component: () => node });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => node,
  });
  const groupRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/planner/groups/$groupId',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, groupRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('GroupsPage', () => {
  it('renders skeleton while loading', async () => {
    server.use(makeGroupsHandlerWithDelay([]));
    renderWithRouter(<GroupsPage />);
    // Router renders the component; skeleton shows while query is pending
    expect(await screen.findByTestId('groups-page-skeleton')).toBeInTheDocument();
  });

  it('renders empty state when 0 groups and user cannot create', async () => {
    server.use(makeGroupsHandler([]));
    renderWithRouter(<GroupsPage canCreateGroup={false} />);
    expect(await screen.findByText('No groups yet')).toBeInTheDocument();
    expect(
      screen.getByText('Ask an admin to create a group and invite you to it.'),
    ).toBeInTheDocument();
    // Should NOT have a create button
    expect(screen.queryByRole('button', { name: /New group/i })).not.toBeInTheDocument();
  });

  it('renders empty state with create CTA when canCreateGroup=true', async () => {
    server.use(makeGroupsHandler([]));
    renderWithRouter(<GroupsPage canCreateGroup={true} />);
    expect(await screen.findByText('No groups yet')).toBeInTheDocument();
    expect(screen.getByText('Create a group to organize plans and people.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New group/i })).toBeInTheDocument();
  });

  it('renders error state with retry button', async () => {
    server.use(makeGroupsErrorHandler());
    renderWithRouter(<GroupsPage />);
    expect(await screen.findByText(/Couldn't load groups/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('renders table by default, toggles to grid on segmented click', async () => {
    const groups = [
      makeGroupWithCounts({ id: 'g1', name: 'Engineering', plan_count: 2, member_count: 5 }),
    ];
    server.use(makeGroupsHandler(groups));
    const user = userEvent.setup();
    renderWithRouter(<GroupsPage />);

    // Wait for data to load and table to appear
    await screen.findByText('Engineering');

    // Column header from GroupsTable proves table is rendered
    expect(screen.getByText('Group')).toBeInTheDocument();

    // Switch to grid
    await user.click(screen.getByRole('tab', { name: /Grid/i }));

    // Grid shows plan/member counts in card format (no column headers)
    // The card-specific text (from GroupsGrid) exists; column headers from table are gone
    expect(screen.queryByText('Activity')).not.toBeInTheDocument();
    // GroupsGrid renders p element with "2 plans · 5 members" — use getAllByText to handle
    // the header summary also containing those numbers in a different format
    const planMemberTexts = screen.getAllByText(/plans · \d+ members/);
    expect(planMemberTexts.length).toBeGreaterThan(0);
  });

  it('filters by search input (debounced 250ms)', async () => {
    const groups = [
      makeGroupWithCounts({ id: 'g1', name: 'Engineering' }),
      makeGroupWithCounts({ id: 'g2', name: 'Marketing' }),
    ];
    server.use(makeGroupsHandler(groups));

    beforeEach(() => vi.useFakeTimers());

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithRouter(<GroupsPage />);

    await screen.findByText('Engineering');
    await screen.findByText('Marketing');

    vi.useFakeTimers();

    const searchInput = screen.getByPlaceholderText(/Search groups/i);
    await user.type(searchInput, 'engin');

    // Before debounce fires, both should still be visible (or input applied but not yet filtered)
    // Advance timers by 250ms to fire debounce
    act(() => {
      vi.advanceTimersByTime(250);
    });

    await waitFor(() => {
      expect(screen.queryByText('Marketing')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Engineering')).toBeInTheDocument();
  });

  it('opens create dialog on "+ New group" button click', async () => {
    const groups = [
      makeGroupWithCounts({ id: 'g1', name: 'Engineering' }),
      makeGroupWithCounts({ id: 'g2', name: 'Marketing' }),
    ];
    server.use(makeGroupsHandler(groups), makeCreateGroupHandler());
    const user = userEvent.setup();
    renderWithRouter(<GroupsPage canCreateGroup={true} />);

    await screen.findByText('Engineering');

    // Click header "+ New group" button (there may be one in header + one from toolbar area)
    const newGroupBtn = screen.getAllByRole('button', { name: /New group/i }).at(0);
    if (!newGroupBtn) throw new Error('No "New group" button found');
    await user.click(newGroupBtn);

    // Dialog should open
    expect(await screen.findByRole('dialog', { name: /Create a group/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Group name/i)).toBeInTheDocument();
  });

  it('row links navigate to /planner/groups/$groupId', async () => {
    const groups = [makeGroupWithCounts({ id: 'g-eng', name: 'Engineering' })];
    server.use(makeGroupsHandler(groups));
    renderWithRouter(<GroupsPage />);

    await screen.findByText('Engineering');
    const link = screen.getByRole('link', { name: /Engineering/i });
    expect(link.getAttribute('href')).toContain('g-eng');
  });

  it('shows the source filter only when at least one group is from m365', async () => {
    const groups = [
      makeGroupWithCounts({ id: 'g1', name: 'Native', external_source: 'native' }),
      makeGroupWithCounts({ id: 'g2', name: 'M365 Group', external_source: 'm365' }),
    ];
    server.use(makeGroupsHandler(groups));
    renderWithRouter(<GroupsPage />);

    await screen.findByText('Native');
    // Source filter pill should appear because at least one m365 group exists
    expect(screen.getByRole('button', { name: /Source/i })).toBeInTheDocument();
  });
});
