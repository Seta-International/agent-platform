import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { delay, HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { makePlan } from '../testing/fixtures';
import { PlanCategoriesSettingsPage } from './plan-categories-settings-page';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const CATEGORIES_RESPONSE = {
  descriptions: { category1: 'Backend', category2: 'Frontend', category3: 'Docs' },
  labels: [
    {
      id: 'l1',
      tenant_id: 't',
      plan_id: 'p1',
      name: 'Backend',
      color: 'blue',
      category_slot: 1,
      created_at: '',
      deleted_at: null,
    },
  ],
  task_counts: { '1': 4, '2': 2 },
  counts: { categories: 3 },
};

function renderPage(planId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/planner/plans/$planId/settings/categories',
    component: () => <PlanCategoriesSettingsPage planId={planId} />,
  });
  const groupsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/planner/groups',
    component: () => <div data-testid="groups-page">groups list</div>,
  });
  const routeTree = rootRoute.addChildren([pageRoute, groupsRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/planner/plans/${planId}/settings/categories`],
    }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('PlanCategoriesSettingsPage', () => {
  it('shows a loading skeleton while categories are loading', async () => {
    server.use(
      http.get('/api/planner/v1/plans/p1/categories', async () => {
        await delay(50);
        return HttpResponse.json(CATEGORIES_RESPONSE);
      }),
    );
    renderPage('p1');
    expect(await screen.findByRole('status', { name: /loading categories/i })).toBeInTheDocument();
  });

  it('shows an error state with retry button on fetch failure', async () => {
    server.use(
      http.get('/api/planner/v1/plans/p1/categories', () =>
        HttpResponse.json({ error: 'BOOM', message: '500 server error' }, { status: 500 }),
      ),
    );
    renderPage('p1');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders the tab strip with Categories active and the category editor', async () => {
    server.use(
      http.get('/api/planner/v1/plans/p1/categories', () => HttpResponse.json(CATEGORIES_RESPONSE)),
    );
    renderPage('p1');
    const categoriesTab = await screen.findByRole('tab', { name: /Categories/ });
    expect(categoriesTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('heading', { name: /Category slots/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Backend')).toBeInTheDocument();
  });

  it('renders the "Heads up" helper card', async () => {
    server.use(
      http.get('/api/planner/v1/plans/p1/categories', () => HttpResponse.json(CATEGORIES_RESPONSE)),
    );
    renderPage('p1');
    expect(await screen.findByText(/Categories without an attached label/i)).toBeInTheDocument();
  });

  it('saves edited categories via the mutation', async () => {
    let savedBody: unknown;
    server.use(
      http.get('/api/planner/v1/plans/p1/categories', () => HttpResponse.json(CATEGORIES_RESPONSE)),
      http.put('/api/planner/v1/plans/p1/categories', async ({ request }) => {
        savedBody = await request.json();
        return HttpResponse.json(makePlan());
      }),
    );
    renderPage('p1');
    const input = await screen.findByLabelText('Slot 4 description');
    fireEvent.change(input, { target: { value: 'Design' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));
    await waitFor(() => {
      expect(savedBody).toEqual({ slots: { 4: { name: 'Design' } } });
    });
  });

  it('redirects to /planner/groups when the user lacks plan.write (403)', async () => {
    server.use(
      http.get('/api/planner/v1/plans/p1/categories', () =>
        HttpResponse.json({ error: 'FORBIDDEN', message: 'nope' }, { status: 403 }),
      ),
    );
    const router = renderPage('p1');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/planner/groups');
    });
  });
});
