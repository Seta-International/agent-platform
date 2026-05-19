import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { fetchMe } from '@/modules/identity/api/client.ts';
import { SessionProvider } from '@/modules/identity/components/SessionProvider.tsx';
import { UserMenu } from '@/modules/identity/components/UserMenu.tsx';
import { AppShell } from '@/shell/layout/app-shell';

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
      <AppShell topBarRight={<UserMenu />}>
        <Outlet />
      </AppShell>
    </SessionProvider>
  );
}
