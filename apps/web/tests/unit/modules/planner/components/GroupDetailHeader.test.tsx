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
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GroupDetailHeader } from '../../../../../src/modules/planner/components/GroupDetailHeader';
import { makeGroup } from '../../../../../src/modules/planner/testing/fixtures';

// EventSource is not provided by happy-dom; use a class-based stub so `new EventSource()` works.
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

const server = setupServer(
  http.get('/api/integrations/m365/groups/:groupId/sync-status', () =>
    HttpResponse.json({ sync_status: null }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderInRouter(node: ReactNode) {
  const qc = makeQueryClient();
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
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
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
  onEditClick: vi.fn(),
  onInviteClick: vi.fn(),
  onCreatePlanClick: vi.fn(),
  onMenuAction: vi.fn(),
};

describe('GroupDetailHeader', () => {
  it('renders the breadcrumb, tile, and title', async () => {
    renderInRouter(<GroupDetailHeader {...baseProps} />);
    expect(await screen.findByRole('heading', { name: 'Engineering' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toHaveTextContent('Planner');
    expect(nav).toHaveTextContent('Groups');
  });

  it('renders Private visibility pill', async () => {
    renderInRouter(<GroupDetailHeader {...baseProps} />);
    await screen.findByRole('heading', { name: 'Engineering' });
    expect(screen.getByText('Private')).toBeInTheDocument();
  });

  it('renders Workspace label when visibility=public', async () => {
    renderInRouter(
      <GroupDetailHeader {...baseProps} group={{ ...baseGroup, visibility: 'public' }} />,
    );
    await screen.findByRole('heading', { name: 'Engineering' });
    expect(screen.getByText('Workspace')).toBeInTheDocument();
  });

  it('hides the Invite and edit pencil when canManage=false', async () => {
    renderInRouter(<GroupDetailHeader {...baseProps} canManage={false} />);
    await screen.findByRole('heading', { name: 'Engineering' });
    expect(screen.queryByRole('button', { name: /Invite/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit group/i })).not.toBeInTheDocument();
  });

  it('calls onEditClick when the edit pencil is clicked', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onEditClick = vi.fn();
    renderInRouter(<GroupDetailHeader {...baseProps} onEditClick={onEditClick} />);
    await user.click(await screen.findByRole('button', { name: /Edit group/i }));
    expect(onEditClick).toHaveBeenCalled();
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

  it('omits the description when null', async () => {
    renderInRouter(
      <GroupDetailHeader {...baseProps} group={{ ...baseGroup, description: null }} />,
    );
    await screen.findByRole('heading', { name: 'Engineering' });
    expect(screen.queryByText('Platform work')).not.toBeInTheDocument();
  });

  it('does not show SyncBadge when external_source is native', async () => {
    server.use(
      http.get('/api/integrations/m365/groups/:groupId/sync-status', () =>
        HttpResponse.json({ sync_status: null }),
      ),
    );
    renderInRouter(
      <GroupDetailHeader {...baseProps} group={{ ...baseGroup, external_source: 'native' }} />,
    );
    await screen.findByRole('heading', { name: 'Engineering' });
    expect(screen.queryByText(/Sync/i)).not.toBeInTheDocument();
  });

  it('does not show the auto-mirror info line for native groups', async () => {
    server.use(
      http.get('/api/integrations/m365/groups/:groupId/sync-status', () =>
        HttpResponse.json({ sync_status: null }),
      ),
    );
    renderInRouter(
      <GroupDetailHeader {...baseProps} group={{ ...baseGroup, external_source: 'native' }} />,
    );
    await screen.findByRole('heading', { name: 'Engineering' });
    expect(screen.queryByTestId('m365-auto-mirror-info')).not.toBeInTheDocument();
  });

  it('shows the auto-mirror info line for m365-linked groups', async () => {
    server.use(
      http.get('/api/integrations/m365/groups/:groupId/sync-status', () =>
        HttpResponse.json({ sync_status: 'idle', synced_at: null, last_error: null }),
      ),
    );
    renderInRouter(
      <GroupDetailHeader
        {...baseProps}
        group={{ ...baseGroup, external_source: 'm365', external_id: 'ext-1' }}
      />,
    );
    const info = await screen.findByTestId('m365-auto-mirror-info');
    expect(info.textContent).toMatch(/mirrored to and from M365 Planner/);
  });

  it('shows SyncBadge with Synced text for m365 group with idle status', async () => {
    server.use(
      http.get('/api/integrations/m365/groups/:groupId/sync-status', () =>
        HttpResponse.json({ sync_status: 'idle', synced_at: null, last_error: null }),
      ),
    );
    renderInRouter(
      <GroupDetailHeader
        {...baseProps}
        group={{ ...baseGroup, external_source: 'm365', external_id: 'ext-1' }}
      />,
    );
    expect(await screen.findByText('Synced')).toBeInTheDocument();
  });

  it('shows "Link to M365…" menu item when external_source is native and canManage', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    renderInRouter(
      <GroupDetailHeader
        {...baseProps}
        group={{ ...baseGroup, external_source: 'native' }}
        canManage={true}
      />,
    );
    await user.click(await screen.findByRole('button', { name: /more/i }));
    expect(screen.getByRole('menuitem', { name: /Link with Microsoft 365/i })).toBeInTheDocument();
  });

  it('shows "Refresh sync" menu item for m365 group', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    renderInRouter(
      <GroupDetailHeader
        {...baseProps}
        group={{ ...baseGroup, external_source: 'm365', external_id: 'ext-1' }}
      />,
    );
    await user.click(await screen.findByRole('button', { name: /more/i }));
    expect(screen.getByRole('menuitem', { name: /Sync now/i })).toBeInTheDocument();
  });

  it('error state badge is clickable and calls refreshGroupSync', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    let refreshCalled = false;
    server.use(
      http.get('/api/integrations/m365/groups/:groupId/sync-status', () =>
        HttpResponse.json({
          sync_status: 'error',
          synced_at: null,
          last_error: 'connection timeout',
        }),
      ),
      http.post('/api/integrations/m365/groups/:groupId/refresh', () => {
        refreshCalled = true;
        return HttpResponse.json({ ok: true });
      }),
    );
    renderInRouter(
      <GroupDetailHeader {...baseProps} group={{ ...baseGroup, external_source: 'm365' }} />,
    );
    await user.click(await screen.findByRole('button', { name: /Sync failed/i }));
    await vi.waitFor(() => expect(refreshCalled).toBe(true));
  });

  it('conflict state badge opens ResolveConflictDialog', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    server.use(
      http.get('/api/integrations/m365/groups/:groupId/sync-status', () =>
        HttpResponse.json({ sync_status: 'conflict', synced_at: null, last_error: null }),
      ),
    );
    renderInRouter(
      <GroupDetailHeader {...baseProps} group={{ ...baseGroup, external_source: 'm365' }} />,
    );
    await user.click(await screen.findByRole('button', { name: /Conflict/i }));
    expect(await screen.findByText('Pick which version to keep')).toBeInTheDocument();
  });
});
