import { AppShell, type ShellLinkProps } from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, redirect, useRouterState } from '@tanstack/react-router';
import { useMemo } from 'react';
import { AgentProvider, AgentSidePanel } from '@/modules/agent';
import { AgentMobileSheet } from '@/modules/agent/chat-experience/agent-mobile-sheet';
import { usePanelUI } from '@/modules/agent/chat-experience/agent-provider';
import { fetchMe } from '@/modules/identity/api/client.ts';
import { SessionProvider } from '@/modules/identity/components/SessionProvider.tsx';
import { UserMenu } from '@/modules/identity/components/UserMenu.tsx';
import { NotificationPopoverContainer } from '@/modules/notifications/components/NotificationPopoverContainer.tsx';
import { useNotificationStream } from '@/modules/notifications/hooks/useNotificationStream.ts';
import { activeNavId, visibleManifests } from '@/shell/manifest-registry.ts';
import { ALL_MANIFESTS } from '@/shell/manifests.ts';
import { fetchEnabledModules } from '../../shell/enabled-modules.ts';

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
  return (
    <SessionProvider session={session}>
      <AgentProvider>
        <ShellWithPanel>
          <Outlet />
        </ShellWithPanel>
      </AgentProvider>
    </SessionProvider>
  );
}

function ShellWithPanel({ children }: { children: React.ReactNode }) {
  const { session } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { panelOpen, setPanelOpen } = usePanelUI();

  const enabledQuery = useQuery({
    queryKey: ['shell', 'enabled-modules'],
    queryFn: ({ signal }) => fetchEnabledModules(signal),
    staleTime: 60_000,
  });

  const navModules = useMemo(() => {
    const enabled = new Set(enabledQuery.data?.enabled ?? ALL_MANIFESTS.map((m) => m.id));
    return visibleManifests(ALL_MANIFESTS, { permissions: new Set(session.permissions) }, enabled);
  }, [enabledQuery.data, session]);

  const activeId = activeNavId(navModules, pathname);

  useNotificationStream(true);

  return (
    <AppShell
      workspace={session.tenant_name}
      modules={navModules}
      activeItemId={activeId}
      linkComponent={ShellLink}
      userMenu={<UserMenu />}
      hideAgent={pathname.startsWith('/agent/')}
      notificationPanel={<NotificationPopoverContainer />}
      agentPanel={<AgentSidePanel onClose={() => setPanelOpen(false)} />}
      agentOpen={panelOpen}
      onAgentOpenChange={setPanelOpen}
      agentMobileSlot={<AgentMobileSheet />}
    >
      {children}
    </AppShell>
  );
}
