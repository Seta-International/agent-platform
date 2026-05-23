import { AppShell, type ShellLinkProps } from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, redirect, useRouterState } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { fetchMe } from '@/modules/identity/api/client.ts';
import { SessionProvider } from '@/modules/identity/components/SessionProvider.tsx';
import { UserMenu } from '@/modules/identity/components/UserMenu.tsx';
import { NotificationDrawerContainer } from '@/modules/notifications/components/NotificationDrawerContainer.tsx';
import { useNotificationStream } from '@/modules/notifications/hooks/useNotificationStream.ts';
import { useUnreadCount } from '@/modules/notifications/hooks/useUnreadCount.ts';
import { fetchEnabledModules } from '@/shell/enabled-modules.ts';
import { activeNavId, visibleManifests } from '@/shell/manifest-registry.ts';
import { ALL_MANIFESTS } from '@/shell/manifests.ts';

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

  const enabledQuery = useQuery({
    queryKey: ['shell', 'enabled-modules'],
    queryFn: ({ signal }) => fetchEnabledModules(signal),
    staleTime: 60_000,
  });

  const navModules = useMemo(() => {
    const enabled = new Set(enabledQuery.data?.enabled ?? ALL_MANIFESTS.map((m) => m.id));
    return visibleManifests(ALL_MANIFESTS, session, enabled);
  }, [enabledQuery.data, session]);

  const activeId = activeNavId(navModules, pathname);

  useNotificationStream(true);
  const { count: notificationCount } = useUnreadCount();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <SessionProvider session={session}>
      <AppShell
        workspace="Acme · Engineering"
        modules={navModules}
        activeItemId={activeId}
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
