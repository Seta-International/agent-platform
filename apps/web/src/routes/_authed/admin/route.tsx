import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import type { SessionScopeProjection } from '@/modules/identity/api/client.ts';

const ADMIN_ROLES = new Set(['org.admin', 'identity.admin']);

export const Route = createFileRoute('/_authed/admin')({
  beforeLoad: ({ context }) => {
    const session = (context as { session?: SessionScopeProjection }).session;
    const roles: string[] = session?.role_summary?.roles ?? [];
    if (!roles.some((r) => ADMIN_ROLES.has(r))) throw redirect({ to: '/403' });
  },
  component: () => <Outlet />,
});
