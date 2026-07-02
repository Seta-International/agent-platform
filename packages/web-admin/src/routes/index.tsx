import { createFileRoute, redirect } from '@tanstack/react-router';

// /admin requires identity.user.list (app gate), so /admin/tenant is always
// reachable for anyone who can land here.
export const Route = createFileRoute('/_authed/admin/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/tenant' });
  },
});
