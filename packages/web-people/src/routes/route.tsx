import type { SessionScopeProjection } from '@seta/web-identity';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/people')({
  beforeLoad: ({ context }) => {
    const session = (context as { session?: SessionScopeProjection }).session;
    const perms = new Set(session?.permissions ?? []);
    if (!perms.has('people.worker.read')) throw redirect({ to: '/403' });
  },
  component: () => <Outlet />,
});
