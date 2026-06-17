import { createFileRoute, Outlet } from '@tanstack/react-router';

// agent.chat.use is granted to every authenticated user. Parent /_authed
// already enforces session existence — no additional gate needed here.
export const Route = createFileRoute('/_authed/agent')({
  component: () => <Outlet />,
});
