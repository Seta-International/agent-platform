import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import type { SessionScopeProjection } from '@/modules/identity/api/client.ts';

export const Route = createFileRoute('/_authed/admin')({
  beforeLoad: ({ context }) => {
    const session = (context as { session?: SessionScopeProjection }).session;
    const perms = new Set(session?.permissions ?? []);
    if (!perms.has('identity.user.read.any')) throw redirect({ to: '/403' });
  },
  component: () => <Outlet />,
});
