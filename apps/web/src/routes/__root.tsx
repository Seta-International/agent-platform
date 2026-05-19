import { createRootRoute, Outlet } from '@tanstack/react-router';
import { AppShell } from '../shell/layout/app-shell';

export const Route = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
