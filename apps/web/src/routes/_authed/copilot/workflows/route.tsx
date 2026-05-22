import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/copilot/workflows')({
  component: () => <Outlet />,
});
