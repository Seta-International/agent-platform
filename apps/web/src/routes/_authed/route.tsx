import { AppShell, type ShellLinkProps } from '@seta/shared-ui';
import { fetchMe, SessionProvider, UserMenu } from '@seta/web-identity';
import { NotificationPopoverContainer, useNotificationStream } from '@seta/web-notifications';
import { useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';
import { useMemo } from 'react';
import { AgentProvider, AgentSidePanel } from '@/modules/agent';
import { AgentMobileSheet } from '@/modules/agent/chat-experience/agent-mobile-sheet';
import { usePanelUI } from '@/modules/agent/chat-experience/agent-provider';
import { useResolveAgentNotification } from '@/modules/agent/notifications/agent-renderers.tsx';
import { useResolvePlannerNotification } from '@/modules/planner/notifications/renderers.tsx';
import { activeAppId, activeNavId, visibleManifests } from '@/shell/manifest-registry.ts';
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
  const activeApp = activeAppId(navModules, pathname);

  const navigate = useNavigate();
  const onAppSelect = (id: string) => {
    const app = navModules.find((m) => m.id === id);
    if (app) navigate({ to: app.routeNamespace as '/' });
  };

  useNotificationStream(true);

  return (
    <AppShell
      workspace={session.tenant_name}
      apps={navModules}
      activeAppId={activeApp ?? navModules[0]?.id ?? ''}
      activeItemId={activeId}
      onAppSelect={onAppSelect}
      linkComponent={ShellLink}
      userMenu={<UserMenu />}
      hideAgent={pathname.startsWith('/agent/')}
      notificationPanel={
        <NotificationPopoverContainer
          resolvers={[useResolvePlannerNotification, useResolveAgentNotification]}
        />
      }
      agentPanel={<AgentSidePanel onClose={() => setPanelOpen(false)} />}
      agentOpen={panelOpen}
      onAgentOpenChange={setPanelOpen}
      agentMobileSlot={<AgentMobileSheet />}
    >
      {children}
    </AppShell>
  );
}
