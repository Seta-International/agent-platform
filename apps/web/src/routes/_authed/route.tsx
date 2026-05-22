import { AppShell, type ShellLinkProps } from '@seta/shared-ui';
import { createFileRoute, Link, Outlet, redirect, useRouterState } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { fetchMe } from '@/modules/identity/api/client.ts';
import { SessionProvider } from '@/modules/identity/components/SessionProvider.tsx';
import { UserMenu } from '@/modules/identity/components/UserMenu.tsx';
import { NotificationDrawerContainer } from '@/modules/notifications/components/NotificationDrawerContainer.tsx';
import { useNotificationStream } from '@/modules/notifications/hooks/useNotificationStream.ts';
import { useUnreadCount } from '@/modules/notifications/hooks/useUnreadCount.ts';
import { useRecentPlans } from '@/modules/planner/hooks/use-recent-plans.ts';
import { activeNavId, buildNavModules } from './-nav';

function ShellLink({ href, ...rest }: ShellLinkProps) {
  // TanStack Router's typed `to` is strictly enumerated; cast preserves intellisense at call sites
  // while letting the shell ship hrefs for routes registered elsewhere.
  return <Link to={href as '/'} {...rest} />;
}

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ location }) => {
    const session = await fetchMe();
    if (!session)
      throw redirect({ to: '/login', search: { redirect: location.href, reason: undefined } });
    return { session };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { session } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { recents } = useRecentPlans(session.tenant_id);
  const navModules = useMemo(() => buildNavModules(recents), [recents]);

  useNotificationStream(true);
  const { count: notificationCount } = useUnreadCount();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <SessionProvider session={session}>
      <AppShell
        workspace="Acme · Engineering"
        modules={navModules}
        activeItemId={activeNavId(pathname)}
        linkComponent={ShellLink}
        userMenu={<UserMenu />}
        hideCopilot={pathname.startsWith('/copilot/')}
        notificationCount={notificationCount}
        onBellClick={() => setDrawerOpen(true)}
      >
        <Outlet />
      </AppShell>
      <NotificationDrawerContainer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </SessionProvider>
  );
}
