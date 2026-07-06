import { AppShell, type ShellLinkProps } from '@seta/shared-ui';
import {
  AgentMobileSheet,
  AgentProvider,
  AgentSidePanel,
  usePanelUI,
  useResolveAgentNotification,
} from '@seta/web-agent';
import { fetchMe, SessionProvider, UserMenu, useRefreshSession } from '@seta/web-identity';
import { NotificationPopoverContainer, useNotificationStream } from '@seta/web-notifications';
import { useResolvePlannerNotification } from '@seta/web-planner';
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
import { clearLastApp, writeLastApp } from '@/shell/last-app.ts';
import { activeAppId, activeNavId, visibleManifests } from '@/shell/manifest-registry.ts';
import { ALL_MANIFESTS } from '@/shell/manifests.ts';
import { settingsAppManifest } from '@/shell/settings-manifest.ts';
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
  const refreshSession = useRefreshSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { panelOpen, setPanelOpen } = usePanelUI();

  const enabledQuery = useQuery({
    queryKey: ['shell', 'enabled-modules'],
    queryFn: ({ signal }) => fetchEnabledModules(signal),
    staleTime: 60_000,
  });

  const navModules = useMemo(() => {
    const enabled = new Set(enabledQuery.data?.enabled ?? ALL_MANIFESTS.map((m) => m.id));
    return visibleManifests(
      ALL_MANIFESTS,
      {
        permissions: new Set(session.permissions),
        product_access: new Set(session.product_access),
      },
      enabled,
    );
  }, [enabledQuery.data, session]);

  // Settings is a system app: it drives chrome for /settings/* but stays out of
  // the launcher (hideInLauncher) and the enabled-modules/product-access gating.
  const chromeManifests = useMemo(() => [...navModules, settingsAppManifest], [navModules]);

  const activeId = activeNavId(chromeManifests, pathname);
  const activeApp = activeAppId(chromeManifests, pathname);

  const navigate = useNavigate();
  const onAppSelect = (id: string) => {
    const app = navModules.find((m) => m.id === id);
    if (app) {
      writeLastApp(session.user_id, id);
      navigate({ to: app.routeNamespace as '/' });
    }
  };

  useNotificationStream(true, () => {
    void refreshSession();
  });

  return (
    <AppShell
      apps={chromeManifests}
      activeAppId={activeApp ?? ''}
      activeItemId={activeId}
      onAppSelect={onAppSelect}
      linkComponent={ShellLink}
      userMenu={<UserMenu onSignOut={() => clearLastApp(session.user_id)} />}
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
