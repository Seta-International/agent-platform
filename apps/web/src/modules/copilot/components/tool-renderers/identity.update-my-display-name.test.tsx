import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import { UpdateMyDisplayNameRenderer } from './identity.update-my-display-name';

function renderInRouter(node: ReactNode) {
  const qc = new QueryClient();
  const rootRoute = createRootRoute({ component: () => node });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => node,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('UpdateMyDisplayNameRenderer', () => {
  it('renders an InteractableCard in input-pending-approval state', async () => {
    renderInRouter(
      <UpdateMyDisplayNameRenderer
        args={{
          displayName: 'Jane Q. Doe',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }}
        state="input-pending-approval"
        callId="call-1"
      />,
    );
    expect(await screen.findByText('Change display name')).toBeInTheDocument();
    expect(screen.getByText('identity.updateMyDisplayName')).toBeInTheDocument();
  });

  it('renders a tool-call OK pill when output-available', async () => {
    renderInRouter(
      <UpdateMyDisplayNameRenderer
        args={{ displayName: 'Jane Q. Doe' }}
        state="output-available"
        callId="call-1"
      />,
    );
    expect(await screen.findByText('Display name updated')).toBeInTheDocument();
  });
});
