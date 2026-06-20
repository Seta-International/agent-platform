import { createFileRoute, Outlet } from '@tanstack/react-router';

// Auth is enforced by the parent `_authed` layout. Add a `beforeLoad` permission
// gate here (see packages/web-admin/src/routes/route.tsx) once this app owns
// RBAC permissions, and list them in `requiredPermissions` in ./manifest.ts.
export const Route = createFileRoute('/_authed/pm')({
  component: () => <Outlet />,
});
