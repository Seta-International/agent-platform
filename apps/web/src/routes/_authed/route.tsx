import { AppShell, type ShellLinkProps, type ShellNavModule } from '@seta/shared-ui';
import { createFileRoute, Link, Outlet, redirect, useRouterState } from '@tanstack/react-router';
import { useMemo } from 'react';
import { fetchMe } from '@/modules/identity/api/client.ts';
import { SessionProvider } from '@/modules/identity/components/SessionProvider.tsx';
import { UserMenu } from '@/modules/identity/components/UserMenu.tsx';
import { type RecentPlan, useRecentPlans } from '@/modules/planner/hooks/use-recent-plans.ts';

function buildNavModules(recents: RecentPlan[]): ShellNavModule[] {
  return [
    {
      id: 'copilot',
      label: 'Copilot',
      icon: 'sparkles',
      items: [
        { id: 'copilot.chat', icon: 'inbox', label: 'Chat', href: '/copilot/chat' },
        {
          id: 'copilot.workflows',
          icon: 'workflow',
          label: 'Workflows',
          href: '/copilot/workflows',
        },
      ],
    },
    {
      id: 'planner',
      label: 'Planner',
      icon: 'board',
      items: [
        { id: 'planner.groups', icon: 'users', label: 'Groups', href: '/planner/groups' },
        ...recents.map((r) => ({
          id: `planner.recent.${r.planId}`,
          label: r.planName,
          href: `/planner/plans/${r.planId}`,
          indent: 1,
        })),
        {
          id: 'planner.search',
          icon: 'search' as const,
          label: 'Search',
          disabled: true,
          disabledHint: 'Task search ships with B5',
        },
        { id: 'planner.trash', icon: 'archive', label: 'Trash', href: '/planner/trash' },
      ],
    },
    {
      id: 'integrations',
      label: 'Integrations',
      icon: 'link',
      items: [
        {
          id: 'integrations.bindings',
          icon: 'link',
          label: 'Bindings',
          disabled: true,
          disabledHint: 'Integrations ship with M2 Stream B3',
        },
        {
          id: 'integrations.conflicts',
          icon: 'alert',
          label: 'Conflicts',
          disabled: true,
          disabledHint: 'Integrations ship with M2 Stream B3',
        },
        {
          id: 'integrations.health',
          icon: 'shield',
          label: 'Health',
          disabled: true,
          disabledHint: 'Integrations ship with M2 Stream B3',
        },
      ],
    },
    {
      id: 'admin',
      label: 'Admin',
      icon: 'building',
      items: [
        { id: 'admin.users', icon: 'users', label: 'Users', href: '/admin/users' },
        { id: 'admin.sso', icon: 'shield', label: 'SSO', href: '/admin/sso' },
        { id: 'admin.audit', icon: 'inbox', label: 'Audit log', href: '/admin/audit' },
      ],
    },
  ];
}

function activeNavId(pathname: string): string | undefined {
  if (pathname.startsWith('/copilot/chat')) return 'copilot.chat';
  if (pathname.startsWith('/planner/groups')) return 'planner.groups';
  if (pathname.startsWith('/planner/plans/')) {
    const planId = pathname.slice('/planner/plans/'.length).split('/')[0];
    if (planId) return `planner.recent.${planId}`;
  }
  if (pathname.startsWith('/planner/trash')) return 'planner.trash';
  if (pathname.startsWith('/admin/users')) return 'admin.users';
  if (pathname.startsWith('/admin/sso')) return 'admin.sso';
  if (pathname.startsWith('/admin/audit')) return 'admin.audit';
  return undefined;
}

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

  return (
    <SessionProvider session={session}>
      <AppShell
        workspace="Acme · Engineering"
        modules={navModules}
        activeItemId={activeNavId(pathname)}
        linkComponent={ShellLink}
        userMenu={<UserMenu />}
        hideCopilot={pathname.startsWith('/copilot/')}
      >
        <Outlet />
      </AppShell>
    </SessionProvider>
  );
}
