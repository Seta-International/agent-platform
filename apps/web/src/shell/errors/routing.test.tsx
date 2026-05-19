import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NotFound } from './not-found';
import { ServerError } from './server-error';

function buildRouter(initialPath: string, errorOnIndex = false) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => {
      if (errorOnIndex) throw new Error('boom');
      return <div>home</div>;
    },
  });
  const routeTree = rootRoute.addChildren([indexRoute]);
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    defaultNotFoundComponent: NotFound,
    defaultErrorComponent: ({ error, reset }) => <ServerError error={error} onReset={reset} />,
  });
}

describe('routing errors', () => {
  it('renders NotFound for unknown path', async () => {
    const router = buildRouter('/does-not-exist');
    render(<RouterProvider router={router} />);
    expect(await screen.findByText(/404 — Page not found/i)).toBeInTheDocument();
  });

  it('renders ServerError when route component throws', async () => {
    const router = buildRouter('/', true);
    render(<RouterProvider router={router} />);
    expect(await screen.findByText(/Something went wrong/i)).toBeInTheDocument();
  });
});
