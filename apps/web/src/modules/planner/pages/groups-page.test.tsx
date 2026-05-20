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
import { groupsHandlers } from '../testing/msw-handlers';
import { GroupsPage } from './groups-page';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

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
  it('renders three group cards in the happy path', async () => {
    server.use(groupsHandlers.threeUp);
    renderWithRouter(<GroupsPage />);
    expect(await screen.findByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('Marketing')).toBeInTheDocument();
    expect(screen.getByText('Ops')).toBeInTheDocument();
  });

  it('shows the empty state when no groups', async () => {
    server.use(groupsHandlers.empty);
    renderWithRouter(<GroupsPage />);
    expect(await screen.findByText(/You're not in any groups yet/i)).toBeInTheDocument();
  });

  it('shows skeletons while loading', async () => {
    server.use(
      http.get('*/api/planner/v1/groups/mine', async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({ groups: [] });
      }),
    );
    renderWithRouter(<GroupsPage />);
    expect(await screen.findAllByTestId('skeleton-card')).toHaveLength(6);
  });

  it('shows an inline error when the fetch fails', async () => {
    server.use(groupsHandlers.error);
    renderWithRouter(<GroupsPage />);
    expect(await screen.findByText(/Couldn't load groups/i)).toBeInTheDocument();
  });
});
