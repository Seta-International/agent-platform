import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { delay, HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PlanCategoriesSettingsPage } from '../../../src/pages/plan-categories-settings-page';
import { makePlan } from '../../../src/testing/fixtures';

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
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
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

  it('renders the sync subhead reflecting the plan link state', async () => {
    server.use(
      http.get('/api/planner/v1/plans/p1/categories', () => HttpResponse.json(CATEGORIES_RESPONSE)),
    );
    renderPage('p1');
    const subhead = await screen.findByTestId('categories-sync-subhead');
    // Default native fixture: subhead shows "Just for this plan".
    expect(subhead.textContent).toMatch(/Just for this plan/);
  });

  // The old hand-rolled nav carried a "Back to board" link; the plan crumb now holds that
  // same /planner/plans/p1 destination, so nothing became unreachable.
  it('renders the breadcrumb trail with the plan crumb linking back to the board', async () => {
    server.use(
      http.get('/api/planner/v1/plans/p1/categories', () => HttpResponse.json(CATEGORIES_RESPONSE)),
      // The plan crumb only renders once usePlanBoard resolves — the other tests in this file
      // don't need the board, so these four handlers are local to this test.
      http.get('/api/planner/v1/plans/p1', () => HttpResponse.json(makePlan({ id: 'p1' }))),
      http.get('/api/planner/v1/plans/p1/buckets', () => HttpResponse.json({ buckets: [] })),
      http.get('/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
      http.get('/api/planner/v1/tasks', () => HttpResponse.json({ tasks: [] })),
    );
    renderPage('p1');
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByRole('link', { name: 'Planner' })).toHaveAttribute('href', '/planner');
    await waitFor(() => {
      expect(within(nav).getByRole('link', { name: 'Q3 Launch' })).toHaveAttribute(
        'href',
        '/planner/plans/p1',
      );
    });
    // "Settings" is a plain non-link crumb; "Categories" is the current page.
    expect(within(nav).getByText('Settings').closest('a')).toBeNull();
    expect(within(nav).getByText('Categories')).toHaveAttribute('aria-current', 'page');
  });

  it('renders the "Heads up" helper card', async () => {
    server.use(
      http.get('/api/planner/v1/plans/p1/categories', () => HttpResponse.json(CATEGORIES_RESPONSE)),
    );
    renderPage('p1');
    expect(await screen.findByText(/Categories without a label/i)).toBeInTheDocument();
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
