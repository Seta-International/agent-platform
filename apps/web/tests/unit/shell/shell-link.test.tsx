import { BreadcrumbItem, Breadcrumbs, LinkProvider } from '@seta/shared-ui';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ShellLink } from '../../../src/routes/_authed/route';

// This is the real production seam, not a stand-in: `ShellLink` is the component the authed
// shell hands to Astryx's `LinkProvider` (see route.tsx's `ShellWithPanel`). Behavior-carrying
// breadcrumb crumbs (e.g. TaskDetailHeader's plan crumb, task-detail-page's modal crumb) keep a
// real `href` alongside an `onClick` that calls `preventDefault()`; this only works because
// `ShellLink` forward-spreads `...rest` — including `onClick` — onto the rendered `<a>`. A stub
// link component can't catch a regression here; only mounting the real component can.
function buildRouter(onCrumbClick: () => void) {
  const rootRoute = createRootRoute({
    component: () => (
      <LinkProvider component={ShellLink}>
        <Breadcrumbs>
          <BreadcrumbItem
            href="/target"
            onClick={(e) => {
              e.preventDefault();
              onCrumbClick();
            }}
          >
            Sprint plan
          </BreadcrumbItem>
          <BreadcrumbItem isCurrent>T-42</BreadcrumbItem>
        </Breadcrumbs>
      </LinkProvider>
    ),
  });
  const targetRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    component: () => <div>target page</div>,
  });
  const routeTree = rootRoute.addChildren([targetRoute]);
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
}

describe('ShellLink (apps/web LinkProvider seam)', () => {
  it('fires a behavior-carrying breadcrumb crumb onClick through the real ShellLink', async () => {
    let clicked = false;
    const router = buildRouter(() => {
      clicked = true;
    });
    render(<RouterProvider router={router} />);

    (await screen.findByRole('link', { name: 'Sprint plan' })).click();

    expect(clicked).toBe(true);
    // The click was intercepted — the router must not have navigated away.
    expect(router.state.location.pathname).toBe('/');
  });
});
