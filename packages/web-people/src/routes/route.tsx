import type { SessionScopeProjection } from '@seta/web-identity';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/people')({
  beforeLoad: ({ context }) => {
    const session = (context as { session?: SessionScopeProjection }).session;
    const perms = new Set(session?.permissions ?? []);
    // performance.read alone (PMO/BoD) may enter the namespace; every other
    // People surface still requires people.worker.read via nav gating and the
    // backend's own requirePermission checks (hidden UI is never the authz).
    if (!perms.has('people.worker.read') && !perms.has('people.performance.read')) {
      throw redirect({ to: '/403' });
    }
  },
  component: () => <Outlet />,
});
