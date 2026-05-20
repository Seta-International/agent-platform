import { AppShell, type ShellLinkProps, type ShellNavModule } from '@seta/shared-ui';
import { createFileRoute, Link, Outlet, redirect, useRouterState } from '@tanstack/react-router';
import { fetchMe } from '@/modules/identity/api/client.ts';
import { SessionProvider } from '@/modules/identity/components/SessionProvider.tsx';
import { UserMenu } from '@/modules/identity/components/UserMenu.tsx';

const NAV_MODULES: ShellNavModule[] = [
  {
    id: 'copilot',
    label: 'Copilot',
    icon: 'sparkles',
    items: [
      {
        id: 'copilot.chat',
        icon: 'inbox',
        label: 'Chat',
        href: '/copilot/chat',
      },
      {
        id: 'copilot.workflows',
        icon: 'workflow',
        label: 'Workflows',
        disabled: true,
        disabledHint: 'Copilot workflows ship with M3',
      },
    ],
  },
  {
    id: 'planner',
    label: 'Planner',
    icon: 'board',
    items: [
      {
        id: 'planner.groups',
        icon: 'users',
        label: 'Groups',
        href: '/planner/groups',
      },
      {
        id: 'planner.trash',
        icon: 'inbox',
        label: 'Trash',
        href: '/planner/trash',
      },
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

function activeNavId(pathname: string): string | undefined {
  if (pathname.startsWith('/copilot/chat')) return 'copilot.chat';
  if (pathname.startsWith('/planner/groups')) return 'planner.groups';
  if (pathname.startsWith('/planner/plans')) return 'planner.groups';
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

  return (
    <SessionProvider session={session}>
      <AppShell
        workspace="Acme · Engineering"
        modules={NAV_MODULES}
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
